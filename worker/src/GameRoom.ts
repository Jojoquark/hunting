import {
  SpielZustand,
  Spieler,
  Position,
  SpielEinstellungen,
  SpielPhase,
  SpielModus
} from './types';
import { haversineDistanz, istInKreis } from './geo';
import { sichtbarFuer } from './sichtbarkeit';
import { pruefeKlassischNaeheWarnung, pruefeKlassischSieg } from './modi/klassisch';
import { verwandleInZombie, pruefeZombieSieg } from './modi/zombie';
import { loeseTicket, pruefeMrXEntfernungsAufdeckung, pruefeDetektivTempo } from './modi/mrx';
import { nutzeFaehigkeit } from './faehigkeiten';
import { spawneLootPunkt, pruefeLootEinsammeln } from './loot';
import { erstelleZonenPlan, berechneAktuelleZone } from '../../shared/src/zone';
import { zufaelligerPunktInKreis } from './geo';
import { normalisiereName, pruefeName } from './Konto';
import {
  hasheZugangstoken,
  istGueltigePosition,
  istSpielerId,
  istZugangstoken,
  istQrGeheimnisKonfiguriert,
  liegtImFangRadius,
  erstelleReplayDeaktiviertAntwort,
  anonymisiereAbgelaufeneSpielDaten,
  vergleicheKonstant
} from './sicherheit';

export class GameRoom {
  private static readonly MAX_SPIELER = 32;
  private static readonly MAX_NACHRICHT_BYTES = 8192;
  private static readonly MAX_NACHRICHTEN_PRO_FENSTER = 120;
  private static readonly NACHRICHT_FENSTER_MS = 10000;
  private static readonly POSITIONS_AUFBEWAHRUNG_MS = 24 * 60 * 60 * 1000;
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
      CREATE TABLE IF NOT EXISTS spieler_zugang (
        spieler_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        erstellt_um INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS anfrage_limits (
        schluessel TEXT PRIMARY KEY,
        start INTEGER NOT NULL,
        anzahl INTEGER NOT NULL
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
        zeit INTEGER,
        aufgenommen_um INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS ereignisse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        typ TEXT,
        daten TEXT,
        zeit INTEGER
      );
    `);
    try {
      this.state.storage.sql.exec(
        `ALTER TABLE positionen_replay ADD COLUMN aufgenommen_um INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      // Die Spalte existiert bereits auf neu angelegten oder migrierten Räumen.
    }
  }

  private async stelleInitialisierungSicher(): Promise<void> {
    if (this.zustand) return;
    await this.initialisiereSqlite();
    await this.ladeZustand();
    const geladen = this.zustand as SpielZustand;
    if (geladen.phase === 'ende' && !geladen.beendetUm && !geladen.datenBereinigt) {
      // Legacy-Räume haben kein Enddatum; anonymisiere sie beim nächsten Zugriff sofort.
      geladen.beendetUm = Date.now() - GameRoom.POSITIONS_AUFBEWAHRUNG_MS;
    }
  }

  private istInitialisiert(): boolean {
    return !!this.state.storage.sql.exec(
      `SELECT wert FROM meta WHERE schluessel = 'raum_initialisiert'`
    ).toArray()[0];
  }

  private async verifiziereZugang(spielerId: string, token: string): Promise<boolean> {
    if (!istSpielerId(spielerId) || !istZugangstoken(token)) return false;
    const row = this.state.storage.sql.exec(
      `SELECT token_hash FROM spieler_zugang WHERE spieler_id = ?`,
      spielerId
    ).toArray()[0];
    if (!row || typeof row.token_hash !== 'string') return false;
    const tokenHash = await hasheZugangstoken(token);
    return vergleicheKonstant(row.token_hash as string, tokenHash);
  }

  private async pruefeRateLimit(schluessel: string, limit: number, fensterMs: number): Promise<number> {
    const jetzt = Date.now();
    const row = this.state.storage.sql.exec(
      `SELECT start, anzahl FROM anfrage_limits WHERE schluessel = ?`,
      schluessel
    ).toArray()[0];
    if (!row || jetzt - Number(row.start) >= fensterMs) {
      this.state.storage.sql.exec(
        `INSERT OR REPLACE INTO anfrage_limits (schluessel, start, anzahl) VALUES (?, ?, 1)`,
        schluessel,
        jetzt
      );
      return 0;
    }
    if (Number(row.anzahl) >= limit) {
      return Math.max(1, Math.ceil((fensterMs - (jetzt - Number(row.start))) / 1000));
    }
    this.state.storage.sql.exec(
      `UPDATE anfrage_limits SET anzahl = anzahl + 1 WHERE schluessel = ?`,
      schluessel
    );
    return 0;
  }

  // Standard: Host fängt (Klassisch/Zombie) bzw. ist Mr. X; alle anderen auf der Gegenseite.
  private standardSeite(spielerId: string): 'faenger' | 'gejagt' {
    const istHost = spielerId === this.zustand.hostId;
    if (this.zustand.modus === 'mrx') return istHost ? 'gejagt' : 'faenger';
    return istHost ? 'faenger' : 'gejagt';
  }

  private rolleFuerSpieler(spielerId: string): Spieler['rolle'] {
    const seite = this.zustand.teamZuteilung?.[spielerId] ?? this.standardSeite(spielerId);
    const modus = this.zustand.modus;
    if (seite === 'faenger') return modus === 'zombie' ? 'zombie' : modus === 'mrx' ? 'detektiv' : 'seeker';
    return modus === 'zombie' ? 'mensch' : modus === 'mrx' ? 'mrx' : 'hider';
  }

  private teamGroessen(): { faenger: number; gejagt: number } {
    const spieler = Object.values(this.zustand.spieler);
    const faenger = spieler.filter((sp) => ['seeker', 'zombie', 'detektiv'].includes(sp.rolle)).length;
    return { faenger, gejagt: spieler.length - faenger };
  }

  private weiseRollenZu(): void {
    for (const spieler of Object.values(this.zustand.spieler)) {
      spieler.rolle = this.rolleFuerSpieler(spieler.id);
    }
  }

  private hatFangEntfernung(faenger: Spieler, ziel: Spieler): boolean {
    return liegtImFangRadius(faenger, ziel, this.zustand.einstellungen.fangRadiusMeter);
  }

  private aktualisiereEinstellungen(wert: unknown): void {
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return;
    const input = wert as Record<string, unknown>;
    const grenzen: Record<string, [number, number]> = {
      dauerMinuten: [5, 240],
      versteckZeitMinuten: [0, 60],
      pingIntervallMinuten: [1, 60],
      zonenRadiusStartMeter: [100, 20000],
      zonenStufen: [1, 12],
      radiusFaktor: [0.2, 0.95],
      fangRadiusMeter: [5, 100],
      autoBestaetigungSekunden: [3, 60],
      kulanzZeitZoneSekunden: [0, 300],
      naeheWarnungRadiusMeter: [10, 1000],
      mrxAufdeckTicketIntervall: [1, 12],
      mrxAufdeckDistanzMeter: [100, 20000],
      mrxAufdeckZeitMinuten: [1, 120]
    };
    for (const [schluessel, [min, max]] of Object.entries(grenzen)) {
      const zahl = input[schluessel];
      if (Number.isFinite(zahl) && (zahl as number) >= min && (zahl as number) <= max) {
        (this.zustand.einstellungen as unknown as Record<string, unknown>)[schluessel] = zahl;
      }
    }
    for (const schluessel of ['naeheWarnungAktiv', 'funklochStrafeAktiv', 'faehigkeitenAktiv', 'mrxSiehtDetektive', 'testModus']) {
      if (typeof input[schluessel] === 'boolean') {
        (this.zustand.einstellungen as unknown as Record<string, unknown>)[schluessel] = input[schluessel];
      }
    }
    if (input.mrxAufdeckRegel === 'tickets' || input.mrxAufdeckRegel === 'entfernung' || input.mrxAufdeckRegel === 'zeit') {
      this.zustand.einstellungen.mrxAufdeckRegel = input.mrxAufdeckRegel;
    }
    const faehigkeitSchalter = input.faehigkeitenSchalter;
    if (faehigkeitSchalter && typeof faehigkeitSchalter === 'object' && !Array.isArray(faehigkeitSchalter)) {
      const erlaubt = new Set(['tarnkappe', 'koeder', 'radar', 'stoersender', 'schild', 'sonderping', 'peilung', 'sonar', 'blackout', 'zonenstoss']);
      const schalter: Record<string, boolean> = {};
      for (const [id, aktiviert] of Object.entries(faehigkeitSchalter as Record<string, unknown>)) {
        if (erlaubt.has(id) && typeof aktiviert === 'boolean') schalter[id] = aktiviert;
      }
      this.zustand.einstellungen.faehigkeitenSchalter = schalter;
    }
  }

  private aktualisiereZone(wert: unknown): void {
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return;
    const punkt = wert as { lat?: unknown; lng?: unknown };
    if (!Number.isFinite(punkt.lat) || !Number.isFinite(punkt.lng) ||
      (punkt.lat as number) < -90 || (punkt.lat as number) > 90 ||
      (punkt.lng as number) < -180 || (punkt.lng as number) > 180) return;
    this.zustand.aktuelleZone.mittelpunkt = { lat: punkt.lat as number, lng: punkt.lng as number };
    this.zustand.aktuelleZone.radiusMeter = this.zustand.einstellungen.zonenRadiusStartMeter;
    this.zustand.aktuelleZone.stufe = 0;
  }

  private bereinigeStandortdatenNachAblauf(): boolean {
    if (!anonymisiereAbgelaufeneSpielDaten(
      this.zustand,
      Date.now(),
      GameRoom.POSITIONS_AUFBEWAHRUNG_MS
    )) return false;
    this.state.storage.sql.exec(`DELETE FROM positionen_replay`);
    this.state.storage.sql.exec(`DELETE FROM spieler_zugang`);
    this.state.storage.sql.exec(`DELETE FROM anfrage_limits`);
    this.state.storage.sql.exec(`DELETE FROM push_abos`);
    this.state.storage.sql.exec(`DELETE FROM ereignisse`);
    this.state.storage.sql.exec(`DELETE FROM spieler`);
    this.state.storage.sql.exec(
      `DELETE FROM meta WHERE schluessel NOT IN ('zustand', 'raum_initialisiert')`
    );
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1000, 'Spiel abgelaufen');
      } catch {
        // Bereits geschlossene Verbindungen sind erledigt.
      }
    }
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.stelleInitialisierungSicher();
    if (this.bereinigeStandortdatenNachAblauf()) await this.speichereZustand();

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/_internal/rate-limit') {
      const body = await request.json().catch(() => ({})) as { limit?: number; fensterMs?: number };
      const limit = Number(body.limit);
      const fensterMs = Number(body.fensterMs);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(fensterMs) || fensterMs < 1000 || fensterMs > 86400000) {
        return new Response('Ungültiges Rate-Limit', { status: 400 });
      }
      const retryAfter = await this.pruefeRateLimit('anfragen', limit, fensterMs);
      return retryAfter
        ? new Response('Zu viele Anfragen', { status: 429, headers: { 'Retry-After': String(retryAfter) } })
        : new Response(null, { status: 204 });
    }

    if (request.method === 'POST' && url.pathname === '/_internal/initialisieren') {
      const body = await request.json().catch(() => ({})) as {
        code?: string;
        hostId?: string;
        spielerId?: string;
        tokenHash?: string;
      };
      if (!body.code || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(body.code) ||
        !body.spielerId || !/^[a-f0-9]{32}$/.test(body.spielerId) ||
        body.hostId !== body.spielerId || !body.tokenHash || !/^[a-f0-9]{64}$/.test(body.tokenHash)) {
        return new Response('Ungültige Initialisierung', { status: 400 });
      }
      if (this.istInitialisiert()) return new Response('Spielcode bereits vergeben', { status: 409 });
      this.zustand.code = body.code;
      this.zustand.hostId = body.spielerId;
      this.state.storage.sql.exec(
        `INSERT INTO spieler_zugang (spieler_id, token_hash, erstellt_um) VALUES (?, ?, ?)`,
        body.spielerId,
        body.tokenHash,
        Date.now()
      );
      this.state.storage.sql.exec(
        `INSERT INTO meta (schluessel, wert) VALUES ('raum_initialisiert', '1')`
      );
      await this.speichereZustand();
      return Response.json({ initialisiert: true }, { status: 201 });
    }

    if (request.method === 'POST' && url.pathname === '/_internal/beitreten') {
      if (!this.istInitialisiert()) return new Response('Spiel nicht gefunden', { status: 404 });
      if (this.zustand.phase !== 'lobby') return new Response('Spiel läuft bereits', { status: 409 });
      const body = await request.json().catch(() => ({})) as { spielerId?: string; tokenHash?: string };
      if (!body.spielerId || !/^[a-f0-9]{32}$/.test(body.spielerId) ||
        !body.tokenHash || !/^[a-f0-9]{64}$/.test(body.tokenHash)) {
        return new Response('Ungültige Zugangsdaten', { status: 400 });
      }
      const anzahl = Number(this.state.storage.sql.exec(`SELECT COUNT(*) AS anzahl FROM spieler_zugang`).toArray()[0]?.anzahl ?? 0);
      if (anzahl >= GameRoom.MAX_SPIELER) return new Response('Spiel ist voll', { status: 409 });
      this.state.storage.sql.exec(
        `INSERT INTO spieler_zugang (spieler_id, token_hash, erstellt_um) VALUES (?, ?, ?)`,
        body.spielerId,
        body.tokenHash,
        Date.now()
      );
      return Response.json({ beigetreten: true }, { status: 201 });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/push/abo')) {
      return new Response('Push-Benachrichtigungen sind derzeit deaktiviert', { status: 501 });
    }

    if (request.method === 'GET' && url.pathname.endsWith('/ws')) {
      if (!this.istInitialisiert()) return new Response('Spiel nicht gefunden', { status: 404 });
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('WebSocket erwartet', { status: 426 });
      }
      const spielerId = url.searchParams.get('spielerId');
      const token = url.searchParams.get('token');
      if (!spielerId || !token || !(await this.verifiziereZugang(spielerId, token))) {
        return new Response('Ungültige Spielersitzung', { status: 401 });
      }
      const verbindungsPause = await this.pruefeRateLimit(`ws:${spielerId}`, 20, 60 * 1000);
      if (verbindungsPause) {
        return new Response('Zu viele Verbindungsversuche', {
          status: 429,
          headers: { 'Retry-After': String(verbindungsPause) }
        });
      }
      const code = url.pathname.match(/\/spiele\/([A-Za-z0-9]{4,8})\/ws$/)?.[1]?.toUpperCase();
      if (code !== this.zustand.code) return new Response('Spiel nicht gefunden', { status: 404 });

      for (const verbund of this.state.getWebSockets()) {
        if (this.state.getTags(verbund)[0] === spielerId) verbund.close(4001, 'Neue Verbindung angemeldet');
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // WebSocket Hibernation API
      this.state.acceptWebSocket(server, [spielerId]);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'GET' && url.pathname.endsWith('/replay')) {
      if (!this.istInitialisiert()) return new Response('Spiel nicht gefunden', { status: 404 });
      const spielerId = request.headers.get('X-Spieler-ID') || '';
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (!(await this.verifiziereZugang(spielerId, token))) {
        return new Response('Authentifizierung erforderlich', { status: 401 });
      }
      const code = url.pathname.match(/\/spiele\/([A-Za-z0-9]{4,8})\/replay$/)?.[1]?.toUpperCase();
      if (code !== this.zustand.code) return new Response('Spiel nicht gefunden', { status: 404 });
      const cutoff = Date.now() - GameRoom.POSITIONS_AUFBEWAHRUNG_MS;
      this.state.storage.sql.exec(`DELETE FROM positionen_replay WHERE aufgenommen_um < ?`, cutoff);
      if (this.zustand.phase !== 'ende' || this.zustand.datenBereinigt) {
        return new Response('Das Replay gibt es erst nach Spielende', { status: 409 });
      }
      return Response.json(this.erstelleReplay());
    }

    const code = url.pathname.match(/\/spiele\/([A-Za-z0-9]{4,8})$/)?.[1]?.toUpperCase();
    if (request.method === 'GET' && code) {
      if (!this.istInitialisiert() || code !== this.zustand.code) {
        return new Response('Spiel nicht gefunden', { status: 404 });
      }
      this.state.storage.sql.exec(
        `DELETE FROM positionen_replay WHERE aufgenommen_um < ?`,
        Date.now() - GameRoom.POSITIONS_AUFBEWAHRUNG_MS
      );
      return Response.json({
        code: this.zustand.code,
        phase: this.zustand.phase,
        modus: this.zustand.modus,
        spielerAnzahl: Object.keys(this.zustand.spieler).length,
        einstellungen: this.zustand.einstellungen
      });
    }
    if (url.pathname.match(/\/spiele\/[A-Za-z0-9]{4,8}$/)) {
      return new Response('Spiel nicht gefunden', { status: 404 });
    }
    return new Response('Nicht gefunden', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const spielerId = this.state.getTags(ws)[0];
    if (!spielerId) {
      ws.close(1008, 'Nicht authentifiziert');
      return;
    }
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > GameRoom.MAX_NACHRICHT_BYTES) {
      ws.close(1009, 'Nachricht zu groß');
      return;
    }
    if (typeof message !== 'string') {
      ws.close(1003, 'Textnachrichten erwartet');
      return;
    }
    await this.stelleInitialisierungSicher();
    if (this.bereinigeStandortdatenNachAblauf()) {
      await this.speichereZustand();
      this.verteileZustand();
    }
    const retryAfter = await this.pruefeRateLimit(
      `ws-message:${spielerId}`,
      GameRoom.MAX_NACHRICHTEN_PRO_FENSTER,
      GameRoom.NACHRICHT_FENSTER_MS
    );
    if (retryAfter) {
      ws.close(1008, 'Zu viele Nachrichten');
      return;
    }
    try {
      const daten = JSON.parse(message);
      await this.verarbeiteAktion(ws, daten);
    } catch (e: any) {
      ws.send(JSON.stringify({ typ: 'fehler', nachricht: e.message }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.stelleInitialisierungSicher();
    if (this.bereinigeStandortdatenNachAblauf()) await this.speichereZustand();
    const spielerId = this.state.getTags(ws)[0];
    if (spielerId && this.zustand.spieler[spielerId]) {
      const weitereVerbindung = this.state.getWebSockets().some((andere) =>
        andere !== ws && this.state.getTags(andere)[0] === spielerId
      );
      if (!weitereVerbindung) {
        this.zustand.spieler[spielerId].online = false;
        await this.speichereZustand();
        this.verteileZustand();
      }
    }
  }

  private async verarbeiteAktion(ws: WebSocket, raw: any): Promise<void> {
    this.zustand.jetzt = Date.now();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
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
          tempo: typeof aktion.tempo === 'number' ? aktion.tempo : undefined
        };
      }
    }

    switch (aktion.typ) {
      case 'ping': {
        ws.send(JSON.stringify({
          typ: 'pong',
          zeit: Number.isFinite(aktion.zeit) ? aktion.zeit : this.zustand.jetzt,
          daten: { serverZeit: this.zustand.jetzt }
        }));
        return;
      }

      case 'hallo': {
        const id = this.state.getTags(ws)[0];
        const spitzname = typeof aktion.spitzname === 'string' ? aktion.spitzname.trim().slice(0, 30) : '';
        const icon = typeof aktion.icon === 'string' && /^[a-z0-9_-]{1,24}$/i.test(aktion.icon) ? aktion.icon : 'circle';
        const farbe = typeof aktion.farbe === 'string' && /^#[0-9a-f]{6}$/i.test(aktion.farbe) ? aktion.farbe : '#ff5c00';
        if (!id || !this.state.storage.sql.exec(`SELECT spieler_id FROM spieler_zugang WHERE spieler_id = ?`, id).toArray()[0]) {
          ws.close(1008, 'Ungültige Spielersitzung');
          return;
        }
        let sp = this.zustand.spieler[id];
        if (!sp) {
          if (Object.keys(this.zustand.spieler).length >= GameRoom.MAX_SPIELER) {
            ws.send(JSON.stringify({ typ: 'fehler', nachricht: 'Spiel ist voll' }));
            return;
          }
          sp = {
            id,
            spitzname: spitzname || 'Spieler',
            icon,
            farbe,
            rolle: this.rolleFuerSpieler(id),
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
          if (spitzname) sp.spitzname = spitzname;
          sp.icon = icon;
          sp.farbe = farbe;
          // Nach dem Start bleibt die Rolle erhalten (z. B. Zuschauer oder Zombie nach Reconnect).
          if (this.zustand.phase === 'lobby') sp.rolle = this.rolleFuerSpieler(id);
        }

        await this.verknuepfeKonto(sp, aktion.konto);

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
        if (this.zustand.phase === 'ende') return;

        const pos = aktion.position as Position;
        // Geräteuhren gehen oft falsch; maßgeblich ist der Empfangszeitpunkt am Server.
        if (pos && typeof pos === 'object') pos.zeit = this.zustand.jetzt;
        if (!istGueltigePosition(pos, this.zustand.jetzt)) {
          ws.send(JSON.stringify({ typ: 'fehler', nachricht: 'Ungültiger oder veralteter Standort' }));
          return;
        }

        // Plausibilitätscheck: Geschwindigkeitsprüfung (> 50 m/s Teleport)
        if (sp.position && !this.zustand.einstellungen.testModus) {
          const dt = Math.max(0.1, (this.zustand.jetzt - (sp.letztesUpdateZeit || this.zustand.jetzt)) / 1000);
          const dist = haversineDistanz(sp.position, pos);
          if (!Number.isFinite(dist) || dist / dt > 50) {
            console.warn(`Verdächtiger GPS-Sprung von ${sp.spitzname}: ${dist.toFixed(0)}m in ${dt.toFixed(1)}s`);
            return; // Ungültige Position verwerfen
          }
        }

        if (sp.position && (this.zustand.phase === 'verstecken' || this.zustand.phase === 'jagd')) {
          const schritt = haversineDistanz(sp.position, pos);
          // Unter 3 m ist GPS-Rauschen, große Sprünge (Testmodus) zählen nicht als gelaufen.
          if (schritt >= 3 && schritt < 500) this.statistikVon(sp).distanzMeter += schritt;
        }
        sp.position = pos;
        sp.letztesUpdateZeit = this.zustand.jetzt;
        this.zeichneWegpunktAuf(sp);

        // Replay-Punkte älter als die Aufbewahrungsfrist entfernen.
        const replayCutoff = this.zustand.jetzt - GameRoom.POSITIONS_AUFBEWAHRUNG_MS;
        this.state.storage.sql.exec(`DELETE FROM positionen_replay WHERE aufgenommen_um < ?`, replayCutoff);

        // Zonenprüfung
        if (this.zustand.phase === 'jagd') {
          const inZone = istInKreis(pos, this.zustand.aktuelleZone.mittelpunkt, this.zustand.aktuelleZone.radiusMeter);
          if (!inZone) {
            if (!sp.ausserhalbZone) {
              sp.ausserhalbZone = true;
              sp.ausserhalbZoneSeit = this.zustand.jetzt;
            } else {
              // Kulanzzeit prüfen
              // Nur Gejagte scheiden durch die Zone aus; Jäger werden außerhalb nur live sichtbar.
              const kulanzMs = this.zustand.einstellungen.kulanzZeitZoneSekunden * 1000;
              const istGejagt = sp.rolle === 'hider' || sp.rolle === 'mensch' || sp.rolle === 'mrx';
              if (istGejagt && !sp.gefangen && this.zustand.jetzt - (sp.ausserhalbZoneSeit || 0) > kulanzMs) {
                sp.gefangen = true;
                sp.gefangenUm = this.zustand.jetzt;
                if (this.zustand.modus === 'zombie') {
                  verwandleInZombie(sp, undefined, this.zustand);
                } else if (this.zustand.modus === 'klassisch') {
                  sp.rolle = 'zuschauer';
                }
                this.protokolliere('ausgeschieden', { ziel: sp.id });
                this.pruefeSieg();
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
        if (this.zustand.phase !== 'jagd') {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Fangen ist nur während der Jagd möglich' }));
          return;
        }
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
        if (!this.hatFangEntfernung(faenger, ziel)) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Zu weit entfernt' }));
          return;
        }

        if (ziel.faehigkeitenStatus.schildBis && this.zustand.jetzt < ziel.faehigkeitenStatus.schildBis) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ziel hat aktiven Schutzschild' }));
          return;
        }

        // Fang vollziehen
        this.statistikVon(faenger).faenge++;
        this.protokolliere('fang', { faenger: faenger.id, ziel: ziel.id });
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
        // QR-HMAC Fallback: nur mit konfiguriertem Geheimnis und frischen Positionen.
        const faengerId = this.state.getTags(ws)[0];
        const { zielId, token } = aktion;
        const ziel = this.zustand.spieler[zielId];
        const faenger = this.zustand.spieler[faengerId];

        if (!ziel || !faenger || ziel.gefangen) return;
        if (this.zustand.phase !== 'jagd') {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Fangen ist nur während der Jagd möglich' }));
          return;
        }

        // Rollen-Validierung
        const faengerDarfFangen = faenger.rolle === 'seeker' || faenger.rolle === 'zombie' || faenger.rolle === 'detektiv';
        const zielDarfGefangenWerden = (ziel.rolle === 'hider' || ziel.rolle === 'mrx' || (this.zustand.modus === 'zombie' && ziel.rolle !== 'zombie')) && !ziel.gefangen;
        if (!faengerDarfFangen || !zielDarfGefangenWerden) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Ungültige Rollenkonstellation' }));
          return;
        }

        const secret: unknown = this.env.QR_SECRET;
        if (!istQrGeheimnisKonfiguriert(secret)) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'QR-Fangen ist nicht konfiguriert' }));
          return;
        }
        const alterFaenger = (this.zustand.jetzt - (faenger.letztesUpdateZeit || 0)) / 1000;
        const alterZiel = (this.zustand.jetzt - (ziel.letztesUpdateZeit || 0)) / 1000;
        if (alterFaenger > 15 || alterZiel > 15 || !this.hatFangEntfernung(faenger, ziel)) {
          ws.send(JSON.stringify({ typ: 'fang_abgelehnt', grund: 'Standortsignal veraltet oder Ziel zu weit entfernt' }));
          return;
        }
        const gueltig = await this.verifiziereQrToken(zielId, token, secret);

        if (gueltig) {
          this.statistikVon(faenger).faenge++;
          this.protokolliere('fang', { faenger: faenger.id, ziel: ziel.id });
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
          this.protokolliere('faehigkeit', { spieler: sp.id, faehigkeit: aktion.faehigkeitId });
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
        this.protokolliere('ticket', { spieler: sp.id, ticket: aktion.ticketTyp, linie: aktion.linie ?? null });
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'chat': {
        const senderId = this.state.getTags(ws)[0];
        const sender = this.zustand.spieler[senderId];
        const text = typeof aktion.text === 'string' ? aktion.text.trim().slice(0, 280) : '';
        const kanal = ['team', 'alle', 'zuschauer'].includes(aktion.kanal) ? aktion.kanal : 'alle';
        if (!sender || !text) return;

        const ereignis = {
          id: `${this.zustand.jetzt}-${Math.random().toString(36).slice(2, 8)}`,
          zeit: this.zustand.jetzt,
          typ: 'chat',
          daten: { senderId, senderName: sender.spitzname, kanal, text }
        };
        for (const empfaengerWs of this.state.getWebSockets()) {
          const empfaengerId = this.state.getTags(empfaengerWs)[0];
          const empfaenger = this.zustand.spieler[empfaengerId];
          if (!empfaenger) continue;
          const darfLesen = kanal === 'alle' ||
            (kanal === 'team' && empfaenger.rolle === sender.rolle) ||
            (kanal === 'zuschauer' && empfaenger.rolle === 'zuschauer');
          if (darfLesen) this.sendeSicher(empfaengerWs, { typ: 'ereignis', daten: ereignis });
        }
        break;
      }

      case 'versteckt': {
        const sp = this.zustand.spieler[this.state.getTags(ws)[0]];
        if (!sp || this.zustand.phase !== 'verstecken' || !this.istVerstecker(sp)) return;
        sp.versteckt = aktion.fertig !== false;
        const abstimmung = this.versteckAbstimmung();
        if (abstimmung.gesamt > 0 && abstimmung.fertig === abstimmung.gesamt) {
          this.zustand.jetzt = Date.now();
          this.starteJagd();
        }
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'host_start': {
        const hostId = this.state.getTags(ws)[0];
        if (this.zustand.hostId === hostId && this.zustand.phase === 'lobby') {
          const online = Object.values(this.zustand.spieler).filter((spieler) => spieler.online);
          if (this.zustand.einstellungen.testModus) this.fuegeTestBotsHinzu();
          else if (online.length < 2) {
            ws.send(JSON.stringify({ typ: 'fehler', nachricht: 'Zum Starten müssen mindestens zwei Spieler verbunden sein' }));
            return;
          }
          this.weiseRollenZu();
          const teams = this.teamGroessen();
          if (teams.faenger === 0 || teams.gejagt === 0) {
            ws.send(JSON.stringify({ typ: 'fehler', nachricht: 'Beide Teams brauchen mindestens einen Spieler' }));
            return;
          }
          await this.starteSpiel();
        }
        break;
      }

      case 'host_team': {
        const hostId = this.state.getTags(ws)[0];
        const zielId = typeof aktion.zielId === 'string' ? aktion.zielId : '';
        if (this.zustand.hostId !== hostId || this.zustand.phase !== 'lobby' || !this.zustand.spieler[zielId]) return;
        if (aktion.seite !== 'faenger' && aktion.seite !== 'gejagt') return;
        this.zustand.teamZuteilung = { ...(this.zustand.teamZuteilung ?? {}), [zielId]: aktion.seite };
        this.weiseRollenZu();
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'host_teams_auto': {
        const hostId = this.state.getTags(ws)[0];
        if (this.zustand.hostId !== hostId || this.zustand.phase !== 'lobby') return;
        const ids = Object.keys(this.zustand.spieler);
        const anzahl = Math.trunc(Number(aktion.faenger));
        if (!Number.isFinite(anzahl) || anzahl < 1 || anzahl >= ids.length) return;
        // Fisher-Yates mit kryptografischem Zufall
        const zufall = crypto.getRandomValues(new Uint32Array(ids.length));
        for (let i = ids.length - 1; i > 0; i--) {
          const j = zufall[i] % (i + 1);
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        this.zustand.teamZuteilung = Object.fromEntries(
          ids.map((id, index) => [id, index < anzahl ? 'faenger' : 'gejagt'])
        );
        this.weiseRollenZu();
        await this.speichereZustand();
        this.verteileZustand();
        break;
      }

      case 'host_setup': {
        const hostId = this.state.getTags(ws)[0];
        if (this.zustand.hostId === hostId && this.zustand.phase === 'lobby') {
          if (['klassisch', 'zombie', 'mrx'].includes(aktion.modus)) {
            // Beim Moduswechsel gelten wieder die Standardteams, die Seiten bedeuten dort etwas anderes.
            if (aktion.modus !== this.zustand.modus) this.zustand.teamZuteilung = {};
            this.zustand.modus = aktion.modus as SpielModus;
            this.weiseRollenZu();
          }
          this.aktualisiereEinstellungen(aktion.einstellungen);
          this.aktualisiereEinstellungen({
            zonenStufen: aktion.zonenStufen,
            radiusFaktor: aktion.radiusFaktor,
            zonenRadiusStartMeter: aktion.zonenRadiusStartMeter
          });
          this.aktualisiereZone(aktion.zoneMittelpunkt);
          await this.speichereZustand();
          this.verteileZustand();
        }
        break;
      }
    }
  }

  async alarm(): Promise<void> {
    await this.stelleInitialisierungSicher();
    this.zustand.jetzt = Date.now();
    this.state.storage.sql.exec(
      `DELETE FROM positionen_replay WHERE aufgenommen_um < ?`,
      this.zustand.jetzt - GameRoom.POSITIONS_AUFBEWAHRUNG_MS
    );

    for (const sp of Object.values(this.zustand.spieler)) {
      if (!sp.gefangen) {
        sp.energie = Math.min(100, sp.energie + (5 / 6));
      }
    }

    if (this.zustand.phase === 'verstecken') {
      const endeVerstecken = this.zustand.phasenStartZeit + this.zustand.einstellungen.versteckZeitMinuten * 60000;
      const abstimmung = this.versteckAbstimmung();
      const alleVersteckt = abstimmung.gesamt > 0 && abstimmung.fertig === abstimmung.gesamt;
      if (this.zustand.jetzt >= endeVerstecken || alleVersteckt) this.starteJagd();
    } else if (this.zustand.phase === 'jagd') {
      this.bewegeTestBots();
      // 1. Ping fällig?
      if (this.zustand.jetzt >= this.zustand.naechsterPingZeit) {
        this.fuehrePingAus();
        this.planeNaechstenPing();
        this.broadcastEreignis({ typ: 'ping' });
        this.protokolliere('ping', {});
      }

      // 1b. Zone nach Plan verkleinern
      this.aktualisiereZonenStatus();

      // 2. Loot spawnen alle 5 Min.
      if (this.zustand.einstellungen.faehigkeitenAktiv &&
        (!this.zustand.letzterLootSpawn || this.zustand.jetzt - this.zustand.letzterLootSpawn >= 300000)) {
        if (this.zustand.lootPunkte.length < 5) {
          spawneLootPunkt(this.zustand);
        }
        this.zustand.letzterLootSpawn = this.zustand.jetzt;
      }

      // 3. Sieg prüfen
      this.pruefeSieg();
    }

    if (this.zustand.phase === 'ende' && !this.zustand.beendetUm) {
      this.zustand.beendetUm = this.zustand.jetzt - GameRoom.POSITIONS_AUFBEWAHRUNG_MS;
    }

    const aufbewahrungEnde = (this.zustand.beendetUm || this.zustand.jetzt) + GameRoom.POSITIONS_AUFBEWAHRUNG_MS;
    this.bereinigeStandortdatenNachAblauf();

    await this.speichereZustand();
    this.verteileZustand();

    if (this.zustand.phase !== 'ende') {
      await this.state.storage.setAlarm(Date.now() + 10000);
    } else if (this.zustand.jetzt < aufbewahrungEnde) {
      await this.state.storage.setAlarm(aufbewahrungEnde);
    } else {
      await this.state.storage.deleteAlarm();
    }
  }

  private static readonly BOT_NAMEN = ['Bot Ada', 'Bot Bruno', 'Bot Cleo'];

  // Testmodus: drei Bots auf der Gegenseite des Hosts, verteilt in der Zone.
  private fuegeTestBotsHinzu(): void {
    const hostSeite = this.zustand.teamZuteilung?.[this.zustand.hostId] ?? this.standardSeite(this.zustand.hostId);
    const botSeite = hostSeite === 'faenger' ? 'gejagt' : 'faenger';
    GameRoom.BOT_NAMEN.forEach((name, index) => {
      const id = `bot-${index + 1}`;
      if (this.zustand.spieler[id]) return;
      this.zustand.teamZuteilung = { ...(this.zustand.teamZuteilung ?? {}), [id]: botSeite };
      const punkt = zufaelligerPunktInKreis(this.zustand.aktuelleZone.mittelpunkt, this.zustand.aktuelleZone.radiusMeter * 0.6);
      this.zustand.spieler[id] = {
        id,
        spitzname: name,
        icon: 'circle',
        farbe: '#8fe33a',
        rolle: this.rolleFuerSpieler(id),
        bereit: true,
        online: true,
        energie: 0,
        ausserhalbZone: false,
        gefangen: false,
        versteckt: true,
        istBot: true,
        position: { ...punkt, genauigkeit: 5, zeit: this.zustand.jetzt },
        letztesUpdateZeit: this.zustand.jetzt,
        faehigkeitenStatus: { tarnkappeAktiv: false, abklingzeiten: {} }
      };
    });
  }

  // Bots gehen alle 10 Sek. etwa 12 m in eine zufällige Richtung und bleiben in der Zone.
  private bewegeTestBots(): void {
    const zone = this.zustand.aktuelleZone;
    for (const sp of Object.values(this.zustand.spieler)) {
      if (!sp.istBot || sp.gefangen || !sp.position) continue;
      let ziel = zufaelligerPunktInKreis(sp.position, 15);
      if (!istInKreis(ziel, zone.mittelpunkt, zone.radiusMeter * 0.9)) {
        ziel = {
          lat: sp.position.lat + (zone.mittelpunkt.lat - sp.position.lat) * 0.2,
          lng: sp.position.lng + (zone.mittelpunkt.lng - sp.position.lng) * 0.2
        };
      }
      sp.position = { ...ziel, genauigkeit: 5, zeit: this.zustand.jetzt };
      sp.letztesUpdateZeit = this.zustand.jetzt;
      sp.ausserhalbZone = false;
      this.zeichneWegpunktAuf(sp);
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

  private starteJagd(): void {
    this.zustand.phase = 'jagd';
    this.zustand.phasenStartZeit = this.zustand.jetzt;
    this.planeNaechstenPing();
    this.erstelleZonenPlanFuerJagd();
    this.broadcastEreignis({ typ: 'phase', phase: 'jagd' });
    this.protokolliere('phase', { phase: 'jagd' });
    this.protokolliereZone();
  }

  // ---------- Replay und Statistik ----------

  private statistikVon(sp: Spieler): { distanzMeter: number; faenge: number } {
    sp.statistik ??= { distanzMeter: 0, faenge: 0 };
    return sp.statistik;
  }

  private protokolliere(typ: string, daten: Record<string, unknown>): void {
    this.state.storage.sql.exec(
      `INSERT INTO ereignisse (typ, daten, zeit) VALUES (?, ?, ?)`,
      typ, JSON.stringify(daten), this.zustand.jetzt
    );
  }

  private protokolliereZone(): void {
    const zone = this.zustand.aktuelleZone;
    if (this.zustand.letzterProtokollRadius !== undefined &&
      Math.abs(this.zustand.letzterProtokollRadius - zone.radiusMeter) < 1) return;
    this.zustand.letzterProtokollRadius = zone.radiusMeter;
    this.protokolliere('zone', { lat: zone.mittelpunkt.lat, lng: zone.mittelpunkt.lng, radius: Math.round(zone.radiusMeter) });
  }

  // Höchstens ein Wegpunkt alle 10 Sek. pro Spieler, nur während der Runde.
  private zeichneWegpunktAuf(sp: Spieler): void {
    if (!sp.position || (this.zustand.phase !== 'verstecken' && this.zustand.phase !== 'jagd')) return;
    if (sp.letzteReplayAufnahme && this.zustand.jetzt - sp.letzteReplayAufnahme < 10000) return;
    sp.letzteReplayAufnahme = this.zustand.jetzt;
    this.state.storage.sql.exec(
      `INSERT INTO positionen_replay (spieler_id, lat, lng, zeit, aufgenommen_um) VALUES (?, ?, ?, ?, ?)`,
      sp.id, sp.position.lat, sp.position.lng, this.zustand.jetzt, this.zustand.jetzt
    );
  }

  private erstelleReplay() {
    const wege: Record<string, Array<[number, number, number]>> = {};
    for (const row of this.state.storage.sql.exec(
      `SELECT spieler_id, lat, lng, zeit FROM positionen_replay ORDER BY zeit`
    ).toArray()) {
      const id = String(row.spieler_id);
      (wege[id] ??= []).push([Number(row.zeit), Number(row.lat), Number(row.lng)]);
    }
    const ereignisse = this.state.storage.sql.exec(`SELECT typ, daten, zeit FROM ereignisse ORDER BY zeit`).toArray()
      .map((row) => ({ zeit: Number(row.zeit), typ: String(row.typ), daten: JSON.parse(String(row.daten || '{}')) }));
    return {
      code: this.zustand.code,
      modus: this.zustand.modus,
      start: this.zustand.spielStartZeit ?? ereignisse[0]?.zeit ?? 0,
      ende: this.zustand.beendetUm ?? this.zustand.jetzt,
      sieger: this.zustand.sieger,
      spieler: Object.values(this.zustand.spieler).map((sp) => ({
        id: sp.id, name: sp.spitzname, rolle: sp.rolle, istBot: Boolean(sp.istBot)
      })),
      wege,
      ereignisse,
      auswertung: this.zustand.auswertung ?? []
    };
  }

  private schliesseSpielAb(): void {
    const sieger = this.zustand.sieger;
    const faengerGewinnt = sieger === 'seeker' || sieger === 'zombie' || sieger === 'detektiv';
    const jagdStart = this.zustand.phasenStartZeit;
    const ende = this.zustand.beendetUm ?? this.zustand.jetzt;
    this.zustand.auswertung = Object.values(this.zustand.spieler).map((sp) => {
      const istFaenger = ['seeker', 'zombie', 'detektiv'].includes(sp.rolle);
      // Wer als Fänger begonnen hat, hat keine „überlebte Zeit“; verwandelte Zombies schon.
      const warGejagt = !istFaenger || sp.gefangenUm !== undefined;
      return {
        id: sp.id,
        name: sp.spitzname,
        rolle: sp.rolle,
        team: istFaenger ? 'faenger' : 'gejagt',
        gewonnen: istFaenger === faengerGewinnt,
        distanzMeter: Math.round(sp.statistik?.distanzMeter ?? 0),
        faenge: sp.statistik?.faenge ?? 0,
        ueberlebtSekunden: warGejagt ? Math.max(0, Math.round(((sp.gefangenUm ?? ende) - jagdStart) / 1000)) : null,
        istBot: Boolean(sp.istBot)
      };
    });
    this.protokolliere('phase', { phase: 'ende', sieger });

    // Ergebnisse an verknüpfte Konten melden (je Spielcode nur einmal gezählt)
    const kontoNamespace = this.env?.KONTO as DurableObjectNamespace | undefined;
    if (!kontoNamespace) return;
    for (const sp of Object.values(this.zustand.spieler)) {
      const eintrag = this.zustand.auswertung.find((a) => a.id === sp.id);
      if (!sp.kontoName || !eintrag) continue;
      const stub = kontoNamespace.get(kontoNamespace.idFromName(normalisiereName(sp.kontoName)));
      this.state.waitUntil(stub.fetch('https://konto/ergebnis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spielCode: this.zustand.code, modus: this.zustand.modus, zeit: ende, ...eintrag })
      }).catch(() => undefined));
    }
  }

  private async verknuepfeKonto(sp: Spieler, konto: unknown): Promise<void> {
    if (!konto || typeof konto !== 'object') return;
    const { name, token } = konto as { name?: unknown; token?: unknown };
    if (pruefeName(name) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
    const kontoNamespace = this.env?.KONTO as DurableObjectNamespace | undefined;
    if (!kontoNamespace) return;
    try {
      const res = await kontoNamespace.get(kontoNamespace.idFromName(normalisiereName(name as string)))
        .fetch('https://konto/pruefen', { method: 'POST', body: JSON.stringify({ token }) });
      if (res.ok) sp.kontoName = ((await res.json()) as { name: string }).name;
    } catch {
      // Ohne Kontoprüfung spielt der Spieler anonym weiter.
    }
  }

  private istVerstecker(sp: Spieler): boolean {
    return ['hider', 'mensch', 'mrx'].includes(sp.rolle) && !sp.gefangen;
  }

  // Wer abstimmen muss: alle verbundenen Verstecker. Getrennte blockieren den Start nicht.
  private versteckAbstimmung(): { fertig: number; gesamt: number } {
    const verstecker = Object.values(this.zustand.spieler).filter((sp) => this.istVerstecker(sp) && sp.online);
    return { fertig: verstecker.filter((sp) => sp.versteckt).length, gesamt: verstecker.length };
  }

  private erstelleZonenPlanFuerJagd(): void {
    const { einstellungen, aktuelleZone } = this.zustand;
    this.zustand.zonenPlan = erstelleZonenPlan(
      { mittelpunkt: aktuelleZone.mittelpunkt, radiusMeter: aktuelleZone.radiusMeter },
      einstellungen.zonenStufen,
      einstellungen.radiusFaktor,
      this.zustand.jetzt,
      einstellungen.dauerMinuten * 60
    );
  }

  private aktualisiereZonenStatus(): void {
    const plan = this.zustand.zonenPlan;
    if (!plan || plan.length === 0) return;
    const status = berechneAktuelleZone(plan, this.zustand.jetzt);
    const vorherigerStatus = this.zustand.zonenStatus;
    this.zustand.aktuelleZone = {
      mittelpunkt: status.zone.mittelpunkt,
      radiusMeter: status.zone.radiusMeter,
      stufe: status.aktiveStufe,
      naechsteZone: status.naechsteStufe
        ? {
          mittelpunkt: status.naechsteStufe.mittelpunkt,
          radiusMeter: status.naechsteStufe.radiusMeter,
          startZeit: status.naechsteStufe.schrumpfStartZeitpunkt
        }
        : undefined
    };
    this.zustand.zonenStatus = status.status;
    this.protokolliereZone();
    if (status.status !== 'stabil' && status.status !== vorherigerStatus) {
      this.broadcastEreignis({ typ: 'zone', status: status.status });
    }
  }

  private planeNaechstenPing(): void {
    const intervallMs = this.zustand.einstellungen.pingIntervallMinuten * 60000;
    this.zustand.naechsterPingZeit = this.zustand.jetzt + intervallMs;
  }

  private pruefeSieg(): void {
    if (this.zustand.modus === 'klassisch') {
      const sieg = pruefeKlassischSieg(this.zustand);
      if (sieg) {
        this.zustand.phase = 'ende';
        this.zustand.beendetUm = this.zustand.jetzt;
        this.zustand.sieger = sieg;
      }
    } else if (this.zustand.modus === 'zombie') {
      const sieg = pruefeZombieSieg(this.zustand);
      if (sieg) {
        this.zustand.phase = 'ende';
        this.zustand.beendetUm = this.zustand.jetzt;
        this.zustand.sieger = sieg;
      }
    } else if (this.zustand.modus === 'mrx') {
      const mrxSpieler = Object.values(this.zustand.spieler).filter((s) => s.rolle === 'mrx');
      const alleMrXGefangen = mrxSpieler.length > 0 && mrxSpieler.every((s) => s.gefangen);
      if (alleMrXGefangen) {
        this.zustand.phase = 'ende';
        this.zustand.beendetUm = this.zustand.jetzt;
        this.zustand.sieger = 'detektiv';
      } else {
        const endeZeit = this.zustand.phasenStartZeit + this.zustand.einstellungen.dauerMinuten * 60000;
        if (this.zustand.jetzt >= endeZeit) {
          this.zustand.phase = 'ende';
          this.zustand.beendetUm = this.zustand.jetzt;
          this.zustand.sieger = 'mrx';
        }
      }
    }
    if (this.zustand.phase === 'ende' && !this.zustand.auswertung) this.schliesseSpielAb();
  }

  // Ein gerade geschlossener Socket darf die Verteilung an alle anderen nicht abbrechen.
  private sendeSicher(ws: WebSocket, nachricht: unknown): void {
    try {
      ws.send(JSON.stringify(nachricht));
    } catch {
      // Verbindung ist bereits geschlossen; webSocketClose räumt den Spieler auf.
    }
  }

  private broadcastEreignis(daten: { typ: string; [key: string]: unknown }): void {
    const ereignis = {
      id: `${this.zustand.jetzt}-${Math.random().toString(36).slice(2, 8)}`,
      zeit: this.zustand.jetzt,
      ...daten
    };
    for (const ws of this.state.getWebSockets()) {
      this.sendeSicher(ws, { typ: 'ereignis', daten: ereignis });
    }
  }

  private filtereZustandFuerSpieler(betrachterId: string): any {
    const betrachter = this.zustand.spieler[betrachterId];
    if (!betrachter) {
      return {
        code: this.zustand.code,
        phase: this.zustand.phase,
        modus: this.zustand.modus,
        spieler: {},
        lootPunkte: [],
        sieger: this.zustand.sieger
      };
    }

    const gefilterteSicht: Record<string, any> = {};

    // Der Host spielt selbst mit und bekommt deshalb keine Sonderansicht.
    for (const [id, ziel] of Object.entries(this.zustand.spieler)) {
      gefilterteSicht[id] = sichtbarFuer(betrachter, ziel, this.zustand);
    }

    const istGejagtSeite = ['hider', 'mensch', 'mrx'].includes(betrachter.rolle);
    const warnRadius = this.zustand.einstellungen.naeheWarnungRadiusMeter;
    const naheGegner = this.zustand.phase === 'jagd' && this.zustand.einstellungen.naeheWarnungAktiv &&
      istGejagtSeite && !betrachter.gefangen && !!betrachter.position &&
      Object.values(this.zustand.spieler).some((sp) =>
        ['seeker', 'zombie', 'detektiv'].includes(sp.rolle) && sp.position &&
        haversineDistanz(betrachter.position!, sp.position) <= warnRadius
      );

    return {
      code: this.zustand.code,
      phase: this.zustand.phase,
      modus: this.zustand.modus,
      jetzt: this.zustand.jetzt,
      phasenStartZeit: this.zustand.phasenStartZeit,
      einstellungen: this.zustand.einstellungen,
      tickets: this.zustand.modus === 'mrx'
        ? Object.values(this.zustand.spieler).find((sp) => sp.rolle === 'mrx')?.mrxStatus?.tickets ?? []
        : [],
      naechsterPingZeit: this.zustand.naechsterPingZeit,
      // Nur die aktuelle Zone: Ziel und Zeitplan der nächsten Stufen bleiben geheim.
      aktuelleZone: {
        mittelpunkt: this.zustand.aktuelleZone.mittelpunkt,
        radiusMeter: this.zustand.aktuelleZone.radiusMeter,
        stufe: this.zustand.aktuelleZone.stufe
      },
      zonenStatus: this.zustand.zonenStatus ?? 'stabil',
      versteckAbstimmung: this.versteckAbstimmung(),
      energie: Math.floor(betrachter.energie),
      naheGegner,
      fangZielId: Object.values(this.zustand.spieler).find((ziel) => {
        const darfFangen = betrachter.rolle === 'seeker' || betrachter.rolle === 'zombie' || betrachter.rolle === 'detektiv';
        const istZiel = ziel.rolle === 'hider' || ziel.rolle === 'mrx' || (this.zustand.modus === 'zombie' && ziel.rolle !== 'zombie');
        return darfFangen && istZiel && !ziel.gefangen && this.hatFangEntfernung(betrachter, ziel);
      })?.id ?? null,
      spieler: Object.fromEntries(
        Object.entries(this.zustand.spieler).map(([id, sp]) => [
          id,
          {
            id: sp.id,
            spitzname: sp.spitzname,
            rolle: sp.rolle,
            farbe: sp.farbe,
            icon: sp.icon,
            online: sp.online,
            istHost: sp.id === this.zustand.hostId,
            istBot: Boolean(sp.istBot),
            gefangen: sp.gefangen,
            versteckt: Boolean(sp.versteckt),
            ausserhalbZone: sp.ausserhalbZone,
            sicht: gefilterteSicht[id]
          }
        ])
      ),
      lootPunkte: this.zustand.lootPunkte,
      sieger: this.zustand.sieger,
      auswertung: this.zustand.phase === 'ende' ? this.zustand.auswertung ?? [] : undefined
    };
  }

  private verteileZustand(): void {
    for (const ws of this.state.getWebSockets()) {
      const tags = this.state.getTags(ws);
      const spielerId = tags[0];
      if (spielerId && this.zustand.spieler[spielerId]) {
        const gefiltert = this.filtereZustandFuerSpieler(spielerId);
        this.sendeSicher(ws, { typ: 'zustand', daten: gefiltert });
      }
    }
  }

  private async starteSpiel(): Promise<void> {
    this.zustand.phase = 'verstecken';
    this.zustand.phasenStartZeit = Date.now();
    this.zustand.spielStartZeit = this.zustand.phasenStartZeit;
    this.zustand.jetzt = this.zustand.phasenStartZeit;
    this.state.storage.sql.exec(`DELETE FROM positionen_replay`);
    this.state.storage.sql.exec(`DELETE FROM ereignisse`);
    this.protokolliere('phase', { phase: 'verstecken' });
    for (const sp of Object.values(this.zustand.spieler)) this.zeichneWegpunktAuf(sp);
    await this.state.storage.setAlarm(Date.now() + 1000);
  }

  private async verifiziereQrToken(spielerId: string, token: string, secret: string): Promise<boolean> {
    if (!istZugangstoken(token)) return false;
    const jetztSlot = Math.floor(Date.now() / 30000);
    for (const slot of [jetztSlot, jetztSlot - 1]) {
      const data = `${spielerId}:${slot}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
      const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
      if (vergleicheKonstant(hex, token)) return true;
    }
    return false;
  }

  private async ladeZustand(): Promise<void> {
    if (this.zustand) return;
    const metaRow = this.state.storage.sql.exec(`SELECT wert FROM meta WHERE schluessel = 'zustand'`).toArray()[0];
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
