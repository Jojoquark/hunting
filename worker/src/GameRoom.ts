import {
  SpielZustand,
  Spieler,
  Position,
  SpielEinstellungen,
  SpielPhase,
  SpielModus,
  PushAbo
} from './types';
import { haversineDistanz, istInKreis } from './geo';
import { sichtbarFuer } from './sichtbarkeit';
import { pruefeKlassischNaeheWarnung, pruefeKlassischSieg } from './modi/klassisch';
import { verwandleInZombie, pruefeZombieSieg } from './modi/zombie';
import { loeseTicket, pruefeMrXEntfernungsAufdeckung, pruefeDetektivTempo } from './modi/mrx';
import { nutzeFaehigkeit } from './faehigkeiten';
import { spawneLootPunkt, pruefeLootEinsammeln } from './loot';
import { sendeWebPush } from './push';

export class GameRoom {
  private state: DurableObjectState;
  private env: any;
  private zustand!: SpielZustand;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  private async initialisiereSqlite(): Promise<void> {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        schluessel TEXT PRIMARY KEY,
        wert TEXT
      );
      CREATE TABLE IF NOT EXISTS spieler (
        id TEXT PRIMARY KEY,
        daten TEXT
      );
      CREATE TABLE IF NOT EXISTS push_abos (
        spieler_id TEXT PRIMARY KEY,
        daten TEXT
      );
      CREATE TABLE IF NOT EXISTS positionen_replay (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spieler_id TEXT,
        lat REAL,
        lng REAL,
        zeit INTEGER
      );
      CREATE TABLE IF NOT EXISTS ereignisse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        typ TEXT,
        daten TEXT,
        zeit INTEGER
      );
    `);
  }

  private async stelleInitialisierungSicher(): Promise<void> {
    if (this.zustand) return;
    await this.initialisiereSqlite();
    await this.ladeZustand();
  }

  async fetch(request: Request): Promise<Response> {
    await this.stelleInitialisierungSicher();

    const url = new URL(request.url);

    // POST /push/abo
    if (request.method === 'POST' && url.pathname.endsWith('/push/abo')) {
      const body = (await request.json()) as any;
      if (body.spielerId && body.abo) {
        this.state.storage.sql.exec(
          `INSERT OR REPLACE INTO push_abos (spieler_id, daten) VALUES (?, ?)`,
          body.spielerId,
          JSON.stringify(body.abo)
        );
        return Response.json({ gespeichert: true });
      }
      return new Response('Ungültige Daten', { status: 400 });
    }

    if (url.pathname.endsWith('/ws')) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('WebSocket erwartet', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // WebSocket Hibernation API
      this.state.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/replay')) {
      if (this.zustand.phase !== 'ende') {
        return new Response(JSON.stringify({ fehler: 'Replay erst nach Spielende verfügbar' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const rows = this.state.storage.sql.exec(
        `SELECT spieler_id, lat, lng, zeit FROM positionen_replay ORDER BY zeit ASC`
      ).toArray();
      return Response.json({ code: this.zustand.code, punkte: rows });
    }

    // Bereinigtes öffentliches JSON (niemals Koordinaten leaken!)
    return Response.json({
      code: this.zustand.code,
      phase: this.zustand.phase,
      modus: this.zustand.modus,
      spielerAnzahl: Object.keys(this.zustand.spieler).length,
      einstellungen: this.zustand.einstellungen
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    await this.stelleInitialisierungSicher();
    try {
      const daten = JSON.parse(message);
      await this.verarbeiteAktion(ws, daten);
    } catch (e: any) {
      ws.send(JSON.stringify({ typ: 'fehler', nachricht: e.message }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.stelleInitialisierungSicher();
    const spielerId = this.state.getTags(ws)[0];
    if (spielerId && this.zustand.spieler[spielerId]) {
      this.zustand.spieler[spielerId].online = false;
      await this.speichereZustand();
      this.verteileZustand();
    }
  }

  private async verarbeiteAktion(ws: WebSocket, raw: any): Promise<void> {
    this.zustand.jetzt = Date.now();
    const aktion = (raw && raw.payload && typeof raw.payload === 'object')
      ? { ...raw.payload, ...raw, typ: raw.typ }
      : raw;
    if (aktion.typ === 'qrFang') aktion.typ = 'qr_fang';
    if (aktion.typ === 'ort' && !aktion.position) {
      if (aktion.lat !== undefined) {
        aktion.position = {
          lat: aktion.lat,
          lng: aktion.lng,
          genauigkeit: aktion.genauigkeit ?? 5,
          zeit: aktion.zeit ?? Date.now(),
          tempo: aktion.tempo
        };
      }
    }

    switch (aktion.typ) {
      case 'hallo': {
        const { id, spitzname, icon, farbe, rolle } = aktion;
        let sp = this.zustand.spieler[id];
        if (!sp) {
          sp = {
            id,
            spitzname: spitzname || 'Spieler',
            icon: icon || 'circle',
            farbe: farbe || '#ff5c00',
            rolle: rolle || 'hider',
            bereit: false,
            online: true,
            energie: 0,
            ausserhalbZone: false,
            gefangen: false,
            faehigkeitenStatus: {
              tarnkappeAktiv: false,
              abklingzeiten: {}
            }
          };
          this.zustand.spieler[id] = sp;
        } else {
          sp.online = true;
        }

        // Taggen für Hibernation-Rückverfolgung
        this.state.tagWebSocket(ws, id);

        ws.send(JSON.stringify({
          typ: 'hallo_antwort',
          zeit: this.zustand.jetzt,
          zustand: this.filtereZustandFuerSpieler(id)
        }));

        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'ort': {
        const spielerId = this.state.getTags(ws)[0];
        const sp = this.zustand.spieler[spielerId];
        if (!sp) return;

        const pos: Position = aktion.position;

        // Plausibilitätscheck: Geschwindigkeitsprüfung (> 50 m/s Teleport)
        if (sp.position) {
          const dt = Math.max(0.1, (this.zustand.jetzt - (sp.letztesUpdateZeit || this.zustand.jetzt)) / 1000);
          const dist = haversineDistanz(sp.position, pos);
          if (dist / dt > 50) {
            console.warn(`Verdächtiger GPS-Sprung von ${sp.spitzname}: ${dist.toFixed(0)}m in ${dt.toFixed(1)}s`);
            return; // Ungültige Position verwerfen
          }
        }

        sp.position = pos;
        sp.letztesUpdateZeit = this.zustand.jetzt;

        // Replay-Daten verdichtet aufnehmen (alle 10s)
        this.state.storage.sql.exec(
          `INSERT INTO positionen_replay (spieler_id, lat, lng, zeit) VALUES (?, ?, ?, ?)`,
          sp.id, pos.lat, pos.lng, pos.zeit
        );

        // Zonenprüfung
        if (this.zustand.phase === 'jagd') {
          const inZone = istInKreis(pos, this.zustand.aktuelleZone.mittelpunkt, this.zustand.aktuelleZone.radiusMeter);
          if (!inZone) {
            if (!sp.ausserhalbZone) {
              sp.ausserhalbZone = true;
              sp.ausserhalbZoneSeit = this.zustand.jetzt;
            } else {
              // Kulanzzeit prüfen
              const kulanzMs = this.zustand.einstellungen.kulanzZeitZoneSekunden * 1000;
              if (this.zustand.jetzt - (sp.ausserhalbZoneSeit || 0) > kulanzMs) {
                sp.gefangen = true;
                sp.gefangenUm = this.zustand.jetzt;
                if (this.zustand.modus === 'zombie') {
                  verwandleInZombie(sp, undefined, this.zustand);
                } else if (this.zustand.modus === 'klassisch') {
                  sp.rolle = 'zuschauer';
                }
              }
            }
          } else {
            sp.ausserhalbZone = false;
            sp.ausserhalbZoneSeit = undefined;
          }

          // Loot prüfen
          pruefeLootEinsammeln(sp, this.zustand);

          // Mr. X Distanz-Aufdeckung prüfen
          if (this.zustand.modus === 'mrx' && sp.rolle === 'mrx') {
            pruefeMrXEntfernungsAufdeckung(sp, this.zustand);
          }
          if (this.zustand.modus === 'mrx' && sp.rolle === 'detektiv') {
            if (pruefeDetektivTempo(sp)) {
              this.broadcastEreignis({ typ: 'detektiv_tempo_warnung', spielerId: sp.id });
            }
          }
        }

        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'fangen': {
        const faengerId = this.state.getTags(ws)[0];
        const zielId = aktion.zielId;
        const faenger = this.zustand.spieler[faengerId];
        const ziel = this.zustand.spieler[zielId];

        if (!faenger || !ziel || ziel.gefangen) return;
        if (!faenger.position || !ziel.position) return;

        // Rollen-Validierung
        const faengerDarfFangen = faenger.rolle === 'seeker' || faenger.rolle === 'zombie' || faenger.rolle === 'detektiv';
        const zielDarfGefangenWerden = (ziel.rolle === 'hider' || ziel.rolle === 'mrx' || (this.zustand.modus === 'zombie' && ziel.rolle !== 'zombie')) && !ziel.gefangen;
        if (!faengerDarfFangen || !zielDarfGefangenWerden) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ungültige Rollenkonstellation' }));
          return;
        }

        // GPS-Frische (<= 15s)
        const alterFaenger = (this.zustand.jetzt - (faenger.letztesUpdateZeit || 0)) / 1000;
        const alterZiel = (this.zustand.jetzt - (ziel.letztesUpdateZeit || 0)) / 1000;
        if (alterFaenger > 15 || alterZiel > 15) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Standortsignal zu alt (> 15s)' }));
          return;
        }

        // Störsender prüfen (150m Umkreis)
        for (const s of Object.values(this.zustand.spieler)) {
          if (s.faehigkeitenStatus.stoersenderBis && this.zustand.jetzt < s.faehigkeitenStatus.stoersenderBis && s.position) {
            if (haversineDistanz(faenger.position, s.position) <= 150) {
              ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Störsender in Reichweite aktiv' }));
              return;
            }
          }
        }

        // Prüfungen: Abstand, Schild
        const distanz = haversineDistanz(faenger.position, ziel.position);
        const maxDistanz = this.zustand.einstellungen.fangRadiusMeter + Math.min(ziel.position.genauigkeit, 20);

        if (distanz > maxDistanz) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Zu weit entfernt' }));
          return;
        }

        if (ziel.faehigkeitenStatus.schildBis && this.zustand.jetzt < ziel.faehigkeitenStatus.schildBis) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ziel hat aktiven Schutzschild' }));
          return;
        }

        // Fang vollziehen
        if (this.zustand.modus === 'zombie') {
          verwandleInZombie(ziel, faenger, this.zustand);
        } else {
          ziel.gefangen = true;
          ziel.gefangenUm = this.zustand.jetzt;
          ziel.gefangenVon = faenger.id;
          if (this.zustand.modus === 'klassisch') {
            ziel.rolle = 'zuschauer';
          }
        }

        this.pruefeSieg();
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'qr_fang': {
        // QR-HMAC Fallback: 30s rotierendes Token
        const faengerId = this.state.getTags(ws)[0];
        const { zielId, token } = aktion;
        const ziel = this.zustand.spieler[zielId];
        const faenger = this.zustand.spieler[faengerId];

        if (!ziel || !faenger || ziel.gefangen) return;

        // Rollen-Validierung
        const faengerDarfFangen = faenger.rolle === 'seeker' || faenger.rolle === 'zombie' || faenger.rolle === 'detektiv';
        const zielDarfGefangenWerden = (ziel.rolle === 'hider' || ziel.rolle === 'mrx' || (this.zustand.modus === 'zombie' && ziel.rolle !== 'zombie')) && !ziel.gefangen;
        if (!faengerDarfFangen || !zielDarfGefangenWerden) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ungültige Rollenkonstellation' }));
          return;
        }

        const secret = this.env.QR_SECRET || 'hunting-default-qr-secret';
        const gueltig = await this.verifiziereQrToken(zielId, token, secret);

        if (gueltig) {
          if (this.zustand.modus === 'zombie') {
            verwandleInZombie(ziel, faenger, this.zustand);
          } else {
            ziel.gefangen = true;
            ziel.gefangenUm = this.zustand.jetzt;
            ziel.gefangenVon = faenger.id;
            if (this.zustand.modus === 'klassisch') {
              ziel.rolle = 'zuschauer';
            }
          }
          this.pruefeSieg();
          await this.speichereZustand();
          this.verteileZustand();
        } else {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ungültiger oder abgelaufener QR-Code' }));
        }
        break;
      }

      case 'faehigkeit': {
        const spielerId = this.state.getTags(ws)[0];
        const sp = this.zustand.spieler[spielerId];
        if (!sp) return;

        const res = nutzeFaehigkeit(sp, aktion.faehigkeitId, aktion.parameter, this.zustand);
        ws.send(JSON.stringify({ typ: 'faehigkeit_antwort', ...res }));
        if (res.erfolg) {
          await this.speichereZustand();
          this.verteileZustand();
        }
        break;
      }

      case 'ticket': {
        const spielerId = this.state.getTags(ws)[0];
        const sp = this.zustand.spieler[spielerId];
        if (!sp || sp.rolle !== 'mrx') return;

        const res = loeseTicket(sp, aktion.ticketTyp, aktion.linie, aktion.haltestelle, this.zustand);
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'host_start': {
        const hostId = this.state.getTags(ws)[0];
        if (this.zustand.hostId === hostId && this.zustand.phase === 'lobby') {
          await this.starteSpiel();
        }
        break;
      }
    }
  }

  async alarm(): Promise<void> {
    await this.stelleInitialisierungSicher();
    this.zustand.jetzt = Date.now();

    for (const sp of Object.values(this.zustand.spieler)) {
      if (!sp.gefangen) {
        sp.energie = Math.min(100, sp.energie + (5 / 6));
      }
    }

    if (this.zustand.phase === 'verstecken') {
      const endeVerstecken = this.zustand.phasenStartZeit + this.zustand.einstellungen.versteckZeitMinuten * 60000;
      if (this.zustand.jetzt >= endeVerstecken) {
        this.zustand.phase = 'jagd';
        this.zustand.phasenStartZeit = this.zustand.jetzt;
        this.planeNaechstenPing();
      }
    } else if (this.zustand.phase === 'jagd') {
      // 1. Ping fällig?
      if (this.zustand.jetzt >= this.zustand.naechsterPingZeit) {
        this.fuehrePingAus();
        this.planeNaechstenPing();
      }

      // 2. T-60s Push Benachrichtigung?
      const vorlaufMs = 60000;
      const diff = this.zustand.naechsterPingZeit - this.zustand.jetzt;
      if (diff <= vorlaufMs && !(this.zustand as any).vorabPushGesendet) {
        (this.zustand as any).vorabPushGesendet = true;
        await this.sendeVorabPush();
      }

      // 3. Loot spawnen alle 5 Min.
      if (!this.zustand.letzterLootSpawn || this.zustand.jetzt - this.zustand.letzterLootSpawn >= 300000) {
        if (this.zustand.lootPunkte.length < 5) {
          spawneLootPunkt(this.zustand);
        }
        this.zustand.letzterLootSpawn = this.zustand.jetzt;
      }

      // 4. Sieg prüfen
      this.pruefeSieg();
    }

    await this.speichereZustand();
    this.verteileZustand();

    // Nächsten Alarm setzen (z.B. alle 10s)
    if (this.zustand.phase !== 'ende') {
      await this.state.storage.setAlarm(Date.now() + 10000);
    } else {
      // 7 Tage Datenbereinigung nach Spielende
      await this.state.storage.setAlarm(Date.now() + 7 * 24 * 3600 * 1000);
    }
  }

  private fuehrePingAus(): void {
    for (const sp of Object.values(this.zustand.spieler)) {
      if (['hider', 'mensch', 'mrx'].includes(sp.rolle) && !sp.gefangen) {
        if (sp.position) {
          const alter = (this.zustand.jetzt - sp.position.zeit) / 1000;
          if (alter <= 90) {
            sp.letzterPingPosition = { lat: sp.position.lat, lng: sp.position.lng };
            sp.letzterPingZeit = this.zustand.jetzt;
            sp.faehigkeitenStatus.tarnkappeAktiv = false;
            sp.faehigkeitenStatus.koederPunkt = undefined;
          } else if (this.zustand.einstellungen.funklochStrafeAktiv) {
            // Funkloch-Strafe auslösen
            sp.funklochStrafeBis = this.zustand.jetzt + 60000;
          }
        }
      }
    }
  }

  private planeNaechstenPing(): void {
    const intervallMs = this.zustand.einstellungen.pingIntervallMinuten * 60000;
    this.zustand.naechsterPingZeit = this.zustand.jetzt + intervallMs;
    (this.zustand as any).vorabPushGesendet = false;
  }

  private async sendeVorabPush(): Promise<void> {
    const rows = this.state.storage.sql.exec(`SELECT spieler_id, daten FROM push_abos`).toArray();
    for (const r of rows) {
      const abo: PushAbo = JSON.parse(r.daten as string);
      const sp = this.zustand.spieler[abo.spielerId];
      if (sp && ['hider', 'mensch', 'mrx'].includes(sp.rolle) && !sp.gefangen) {
        await sendeWebPush(
          abo,
          { titel: 'HUNTING', nachricht: 'Ping in 60 Sekunden – App jetzt öffnen!' },
          this.env.VAPID_PRIVATE || '',
          this.env.VAPID_PUBLIC || ''
        );
      }
    }
  }

  private pruefeSieg(): void {
    if (this.zustand.modus === 'klassisch') {
      const sieg = pruefeKlassischSieg(this.zustand);
      if (sieg) {
        this.zustand.phase = 'ende';
        this.zustand.sieger = sieg;
      }
    } else if (this.zustand.modus === 'zombie') {
      const sieg = pruefeZombieSieg(this.zustand);
      if (sieg) {
        this.zustand.phase = 'ende';
        this.zustand.sieger = sieg;
      }
    } else if (this.zustand.modus === 'mrx') {
      const mrxSpieler = Object.values(this.zustand.spieler).filter((s) => s.rolle === 'mrx');
      const alleMrXGefangen = mrxSpieler.length > 0 && mrxSpieler.every((s) => s.gefangen);
      if (alleMrXGefangen) {
        this.zustand.phase = 'ende';
        this.zustand.sieger = 'detektive';
      } else {
        const endeZeit = this.zustand.phasenStartZeit + this.zustand.einstellungen.dauerMinuten * 60000;
        if (this.zustand.jetzt >= endeZeit) {
          this.zustand.phase = 'ende';
          this.zustand.sieger = 'mrx';
        }
      }
    }
  }

  private filtereZustandFuerSpieler(betrachterId: string): any {
    const betrachter = this.zustand.spieler[betrachterId];
    if (!betrachter && betrachterId !== 'host') {
      return this.zustand;
    }

    const gefilterteSicht: Record<string, any> = {};

    for (const [id, ziel] of Object.entries(this.zustand.spieler)) {
      if (betrachterId === 'host') {
        gefilterteSicht[id] = ziel.position ? { art: 'live', position: ziel.position } : { art: 'unsichtbar' };
      } else {
        gefilterteSicht[id] = sichtbarFuer(betrachter, ziel, this.zustand);
      }
    }

    return {
      code: this.zustand.code,
      phase: this.zustand.phase,
      modus: this.zustand.modus,
      jetzt: this.zustand.jetzt,
      naechsterPingZeit: this.zustand.naechsterPingZeit,
      aktuelleZone: this.zustand.aktuelleZone,
      spieler: Object.fromEntries(
        Object.entries(this.zustand.spieler).map(([id, sp]) => [
          id,
          {
            id: sp.id,
            spitzname: sp.spitzname,
            rolle: sp.rolle,
            farbe: sp.farbe,
            icon: sp.icon,
            gefangen: sp.gefangen,
            ausserhalbZone: sp.ausserhalbZone,
            sicht: gefilterteSicht[id]
          }
        ])
      ),
      lootPunkte: this.zustand.lootPunkte,
      sieger: this.zustand.sieger
    };
  }

  private verteileZustand(): void {
    for (const ws of this.state.getWebSockets()) {
      const tags = this.state.getTags(ws);
      const spielerId = tags[0];
      if (spielerId) {
        const gefiltert = this.filtereZustandFuerSpieler(spielerId);
        ws.send(JSON.stringify({ typ: 'zustand', daten: gefiltert }));
      }
    }
  }

  private async starteSpiel(): Promise<void> {
    this.zustand.phase = 'verstecken';
    this.zustand.phasenStartZeit = Date.now();
    await this.state.storage.setAlarm(Date.now() + 1000);
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  private async verifiziereQrToken(spielerId: string, token: string, secret: string): Promise<boolean> {
    const jetztSlot = Math.floor(Date.now() / 30000);
    for (const slot of [jetztSlot, jetztSlot - 1]) {
      const data = `${spielerId}:${slot}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
      const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
      if (this.constantTimeEqual(hex, token)) return true;
    }
    return false;
  }

  private async ladeZustand(): Promise<void> {
    if (this.zustand) return;
    const metaRow = this.state.storage.sql.exec(`SELECT wert FROM meta WHERE schluessel = 'zustand'`).one();
    if (metaRow) {
      this.zustand = JSON.parse(metaRow.wert as string);
    } else {
      this.zustand = {
        code: 'HUNT26',
        hostId: 'host',
        phase: 'lobby',
        modus: 'klassisch',
        einstellungen: {
          dauerMinuten: 60,
          versteckZeitMinuten: 10,
          pingIntervallMinuten: 5,
          zonenRadiusStartMeter: 1000,
          zonenStufen: 4,
          radiusFaktor: 0.65,
          fangRadiusMeter: 25,
          autoBestaetigungSekunden: 15,
          kulanzZeitZoneSekunden: 60,
          naeheWarnungAktiv: true,
          naeheWarnungRadiusMeter: 100,
          funklochStrafeAktiv: true,
          faehigkeitenAktiv: false,
          faehigkeitenSchalter: {},
          mrxAufdeckRegel: 'tickets',
          mrxAufdeckTicketIntervall: 3,
          mrxAufdeckDistanzMeter: 2000,
          mrxAufdeckZeitMinuten: 15,
          mrxSiehtDetektive: true
        },
        spieler: {},
        aktuelleZone: {
          mittelpunkt: { lat: 52.52, lng: 13.405 },
          radiusMeter: 1000,
          stufe: 0
        },
        lootPunkte: [],
        phasenStartZeit: 0,
        naechsterPingZeit: 0,
        jetzt: Date.now()
      };
    }
  }

  private async speichereZustand(): Promise<void> {
    this.state.storage.sql.exec(
      `INSERT OR REPLACE INTO meta (schluessel, wert) VALUES ('zustand', ?)`,
      JSON.stringify(this.zustand)
    );
  }
}
