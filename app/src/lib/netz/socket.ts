import { baueSpielWsUrl, ermittleBasisWsUrl } from './config.js';

export type VerbindungsStatus =
  | 'getrennt'
  | 'verbinde'
  | 'verbunden'
  | 'reconnect'
  | 'nicht_erreichbar'
  | 'demo';

export interface ServerZeitSync {
  rtt: number;
  offset: number;
  letzterAbgleich: number;
}

export interface AusgehendeNachricht {
  typ:
    | 'hallo'
    | 'ort'
    | 'fangen'
    | 'fangAntwort'
    | 'faehigkeit'
    | 'ticket'
    | 'chat'
    | 'host'
    | 'host_start'
    | 'host_setup'
    | 'ping';
  payload: unknown;
  zeit: number;
}

export type EingehendeNachricht =
  | { typ: 'zustand'; daten: Record<string, any> }
  | { typ: 'ereignis'; daten: { typ: string; [key: string]: any } }
  | { typ: 'sicht'; daten: unknown }
  | { typ: 'zeit'; daten: { serverZeit?: number } }
  | { typ: 'pong'; daten: { serverZeit?: number }; zeit?: number }
  | { typ: 'fehler'; daten: { code?: string; nachricht?: string; kannDemo?: boolean } }
  | { typ: 'fang_abgelehnt'; grund?: string; daten?: unknown };

export type NachrichtenHandler = (msg: EingehendeNachricht) => void;

export interface DemoBot {
  id: string;
  name: string;
  rolle: 'seeker' | 'hider' | 'zombie';
  farbe: string;
  icon: string;
  lat: number;
  lng: number;
  bereit: boolean;
  gefangen: boolean;
}

export interface DemoOptionen {
  modus?: 'klassisch' | 'zombie' | 'mrx';
  spielerName?: string;
  spielerRolle?: 'seeker' | 'hider';
  startKoordinaten?: { lat: number; lng: number };
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectVersuch = 0;
  private readonly maxReconnectVersuche = 4;
  private readonly maxReconnectPause = 8000;
  private readonly verbindungsTimeoutDauer = 6000;

  private reconnectTimer: number | null = null;
  private verbindungsTimeoutTimer: number | null = null;
  private pingIntervallTimer: number | null = null;

  private offlineWarteschlange: AusgehendeNachricht[] = [];
  private handler: Set<NachrichtenHandler> = new Set();
  private letzteHallo: AusgehendeNachricht | null = null;

  public status: VerbindungsStatus = 'getrennt';
  public sync: ServerZeitSync = { rtt: 0, offset: 0, letzterAbgleich: 0 };
  public spielCode: string = '';
  public spielerId: string = '';

  private demoAktiv = false;
  private demoTimer: number | null = null;
  private demoSpielerLat = 52.52;
  private demoSpielerLng = 13.405;
  private demoBots: DemoBot[] = [];
  private demoPhase: 'lobby' | 'versteckphase' | 'jagd' | 'ende' = 'lobby';
  private demoModus: 'klassisch' | 'zombie' | 'mrx' = 'klassisch';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sofortNeuVerbinden());
      // Nach Display-Sperre oder App-Wechsel sofort neu verbinden statt auf den Backoff zu warten.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.sofortNeuVerbinden();
      });
    }
  }

  private sofortNeuVerbinden(): void {
    if (
      (this.status === 'reconnect' || this.status === 'nicht_erreichbar') &&
      this.url &&
      !this.demoAktiv
    ) {
      this.abbrechenReconnect();
      this.reconnectVersuch = 0;
      this.setStatus('reconnect');
      this.initialisiereWebSocket();
    }
  }

  public verbinden(
    basisUrl: string = '',
    code: string,
    spielerId: string,
    token: string = ''
  ): void {
    this.beendeDemoModus();
    this.spielCode = code.toUpperCase();
    this.spielerId = spielerId;
    this.reconnectVersuch = 0;
    this.letzteHallo = null;

    if (!basisUrl || basisUrl.trim().length === 0) {
      this.url = baueSpielWsUrl(this.spielCode, this.spielerId, token);
    } else {
      const standardSchema = basisUrl.startsWith('https')
        ? 'wss:'
        : basisUrl.startsWith('http')
          ? 'ws:'
          : 'wss:';
      const reinerHost = basisUrl
        .replace(/^https?:\/\//, '')
        .replace(/^wss?:\/\//, '')
        .replace(/\/ws\/?$/, '')
        .replace(/\/$/, '');
      this.url = `${standardSchema}//${reinerHost}/spiele/${this.spielCode}/ws?spielerId=${encodeURIComponent(spielerId)}&token=${encodeURIComponent(token)}`;
    }

    this.setStatus('verbinde');
    this.initialisiereWebSocket();
  }

  private initialisiereWebSocket(): void {
    this.aufraeumenSocket();

    this.verbindungsTimeoutTimer = window.setTimeout(() => {
      this.verbindungsTimeoutTimer = null;
      if (this.status === 'verbinde' || this.status === 'reconnect' || this.status === 'nicht_erreichbar') {
        this.behandleVerbindungsAbbruch();
      }
    }, this.verbindungsTimeoutDauer);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.loescheTimeoutTimer();
        this.setStatus('verbunden');
        this.reconnectVersuch = 0;
        // Der Server markiert Spieler erst nach "hallo" wieder als online.
        if (this.letzteHallo) {
          this.offlineWarteschlange = this.offlineWarteschlange.filter((n) => n.typ !== 'hallo');
          this.ws?.send(JSON.stringify(this.letzteHallo));
        }
        this.sendeZeitSyncPing();
        this.starteHeartbeat();
        this.leereWarteschlange();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const nachricht: EingehendeNachricht = JSON.parse(event.data);
          this.verarbeiteNachricht(nachricht);
        } catch {
          return;
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.loescheTimeoutTimer();
        this.stoppeHeartbeat();
        // 4001: dieselbe Sitzung wurde in einem anderen Tab/Gerät geöffnet; 1008: Sitzung ungültig.
        // Ein Reconnect würde sich dort gegenseitig endlos hinauswerfen.
        if (event.code === 4001 || event.code === 1008) {
          this.aufraeumenSocket();
          this.setStatus('getrennt');
          this.benachrichtigeHandler({
            typ: 'fehler',
            daten: {
              code: event.code === 4001 ? 'SITZUNG_UEBERNOMMEN' : 'SITZUNG_UNGUELTIG',
              nachricht: event.code === 4001
                ? 'Dieses Spiel ist in einem anderen Tab oder auf einem anderen Gerät geöffnet.'
                : 'Die Spielsitzung ist ungültig. Bitte tritt erneut bei.'
            }
          });
          return;
        }
        if (this.status !== 'getrennt' && !this.demoAktiv) {
          this.behandleVerbindungsAbbruch();
        }
      };

      this.ws.onerror = () => {
        this.loescheTimeoutTimer();
      };
    } catch {
      this.behandleVerbindungsAbbruch();
    }
  }

  private behandleVerbindungsAbbruch(): void {
    this.aufraeumenSocket();

    // Draußen fallen Verbindungen oft kurz aus: weiter versuchen, aber den Ausfall melden.
    if (this.reconnectVersuch >= this.maxReconnectVersuche) {
      if (this.status !== 'nicht_erreichbar') {
        this.setStatus('nicht_erreichbar');
        this.benachrichtigeHandler({
          typ: 'fehler',
          daten: {
            code: 'SERVER_NICHT_ERREICHBAR',
            nachricht: 'Keine Verbindung zum Spielserver. Neuer Versuch läuft automatisch …'
          }
        });
      }
    } else {
      this.setStatus('reconnect');
    }
    this.planeReconnect();
  }

  private planeReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectVersuch++;
    const exponentiellePause = Math.min(
      this.maxReconnectPause,
      400 * Math.pow(1.5, this.reconnectVersuch)
    );
    const zufallsJitter = Math.random() * 250;
    const wartezeit = exponentiellePause + zufallsJitter;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.status === 'reconnect' || this.status === 'nicht_erreichbar') {
        this.initialisiereWebSocket();
      }
    }, wartezeit);
  }

  private abbrechenReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private loescheTimeoutTimer(): void {
    if (this.verbindungsTimeoutTimer !== null) {
      clearTimeout(this.verbindungsTimeoutTimer);
      this.verbindungsTimeoutTimer = null;
    }
  }

  private aufraeumenSocket(): void {
    this.loescheTimeoutTimer();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        return;
      }
      this.ws = null;
    }
  }

  private setStatus(neuerStatus: VerbindungsStatus): void {
    this.status = neuerStatus;
    this.benachrichtigeHandler({
      typ: 'zustand',
      daten: {
        __status: neuerStatus,
        kannDemoStarten: neuerStatus === 'nicht_erreichbar'
      }
    });
  }

  private starteHeartbeat(): void {
    this.stoppeHeartbeat();
    this.pingIntervallTimer = window.setInterval(() => {
      this.sendeZeitSyncPing();
    }, 15000);
  }

  private stoppeHeartbeat(): void {
    if (this.pingIntervallTimer !== null) {
      clearInterval(this.pingIntervallTimer);
      this.pingIntervallTimer = null;
    }
  }

  private sendeZeitSyncPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          typ: 'ping',
          zeit: Date.now()
        })
      );
    }
  }

  private verarbeiteNachricht(msg: EingehendeNachricht): void {
    if (msg.typ === 'pong' && typeof msg.zeit === 'number') {
      const jetzt = Date.now();
      const gesendet = msg.zeit;
      const rtt = Math.max(1, jetzt - gesendet);
      const serverZeit =
        (msg.daten as { serverZeit?: number })?.serverZeit ?? jetzt;
      const offset = serverZeit - (gesendet + rtt / 2);

      this.sync = {
        rtt,
        offset,
        letzterAbgleich: jetzt
      };
      return;
    }

    if (
      msg.typ === 'zeit' &&
      typeof (msg.daten as { serverZeit?: number })?.serverZeit === 'number'
    ) {
      const jetzt = Date.now();
      this.sync.offset =
        (msg.daten as { serverZeit: number }).serverZeit - jetzt;
      this.sync.letzterAbgleich = jetzt;
      return;
    }

    this.benachrichtigeHandler(msg);
  }

  private benachrichtigeHandler(msg: EingehendeNachricht): void {
    for (const h of this.handler) {
      try {
        h(msg);
      } catch {
        continue;
      }
    }
  }

  public senden(typ: AusgehendeNachricht['typ'], payload: unknown): void {
    if (this.demoAktiv) {
      this.verarbeiteDemoAktion(typ, payload);
      return;
    }

    const nachricht: AusgehendeNachricht = {
      typ,
      payload,
      zeit: Date.now()
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(nachricht));
        return;
      } catch {
        this.offlineWarteschlange.push(nachricht);
        return;
      }
    }

    if (typ === 'ort') {
      this.offlineWarteschlange = this.offlineWarteschlange.filter(
        (n) => n.typ !== 'ort'
      );
    }

    this.offlineWarteschlange.push(nachricht);
  }

  private leereWarteschlange(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.offlineWarteschlange.length > 0) {
      const naechste = this.offlineWarteschlange.shift();
      if (naechste) {
        try {
          this.ws.send(JSON.stringify(naechste));
        } catch {
          this.offlineWarteschlange.unshift(naechste);
          break;
        }
      }
    }
  }

  public getAktuelleServerZeit(): number {
    return Date.now() + this.sync.offset;
  }

  public abonnieren(callback: NachrichtenHandler): () => void {
    this.handler.add(callback);
    return () => this.handler.delete(callback);
  }

  public trennen(): void {
    this.beendeDemoModus();
    this.abbrechenReconnect();
    this.stoppeHeartbeat();
    this.setStatus('getrennt');
    this.aufraeumenSocket();
  }

  public aktiviereDemoModus(optionen: DemoOptionen = {}): void {
    this.trennen();
    this.demoAktiv = true;
    this.spielCode = this.spielCode || 'DEMO-782';
    this.spielerId = this.spielerId || 'spieler-lokal';
    this.demoModus = optionen.modus || 'klassisch';
    this.demoPhase = 'lobby';

    if (optionen.startKoordinaten) {
      this.demoSpielerLat = optionen.startKoordinaten.lat;
      this.demoSpielerLng = optionen.startKoordinaten.lng;
    }

    const basisLat = this.demoSpielerLat;
    const basisLng = this.demoSpielerLng;

    this.demoBots = [
      {
        id: 'bot-1',
        name: 'Bot Ada',
        rolle: 'hider',
        farbe: '#00e599',
        icon: 'target',
        lat: basisLat + 0.0018,
        lng: basisLng + 0.0022,
        bereit: true,
        gefangen: false
      },
      {
        id: 'bot-2',
        name: 'Bot Bob',
        rolle: 'hider',
        farbe: '#3b82f6',
        icon: 'shield',
        lat: basisLat - 0.0024,
        lng: basisLng + 0.0016,
        bereit: true,
        gefangen: false
      },
      {
        id: 'bot-3',
        name: 'Bot Charlie',
        rolle: 'seeker',
        farbe: '#ff3b5c',
        icon: 'crosshair',
        lat: basisLat + 0.0031,
        lng: basisLng - 0.0019,
        bereit: true,
        gefangen: false
      }
    ];

    this.setStatus('demo');
    this.sendeDemoZustand();
    this.starteDemoSimulationsLoop();
  }

  public beendeDemoModus(): void {
    if (this.demoTimer !== null) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.demoAktiv = false;
  }

  public istImDemoModus(): boolean {
    return this.demoAktiv;
  }

  private starteDemoSimulationsLoop(): void {
    if (this.demoTimer !== null) {
      clearInterval(this.demoTimer);
    }

    this.demoTimer = window.setInterval(() => {
      if (!this.demoAktiv) {
        return;
      }

      if (this.demoPhase === 'jagd') {
        for (const bot of this.demoBots) {
          if (!bot.gefangen) {
            const deltaLat = (Math.random() - 0.5) * 0.0003;
            const deltaLng = (Math.random() - 0.5) * 0.0003;
            bot.lat += deltaLat;
            bot.lng += deltaLng;
          }
        }
        this.sendeDemoSichtPositionen();
      }
    }, 2000);
  }

  private sendeDemoZustand(): void {
    const spielerListe = [
      {
        id: this.spielerId,
        name: 'Du (Host)',
        rolle: 'seeker',
        farbe: '#ff5c00',
        icon: 'crosshair',
        bereit: true,
        istHost: true,
        verbunden: true,
        energie: 100,
        gefangen: false,
        aktiveFaehigkeiten: [],
        abklingzeiten: {}
      },
      ...this.demoBots.map((b) => ({
        id: b.id,
        name: b.name,
        rolle: b.rolle,
        farbe: b.farbe,
        icon: b.icon,
        bereit: b.bereit,
        istHost: false,
        verbunden: true,
        energie: 100,
        gefangen: b.gefangen,
        aktiveFaehigkeiten: [],
        abklingzeiten: {}
      }))
    ];

    const snapshot = {
      code: this.spielCode,
      phase: this.demoPhase,
      modus: this.demoModus,
      einstellungen: {
        spielDauerMinuten: 30,
        versteckZeitMinuten: 2,
        pingIntervallMinuten: 3,
        zonenRadiusMeter: 800,
        zonenStufen: 3,
        zonenFaktor: 0.7,
        fangRadiusMeter: 20
      },
      spieler: spielerListe,
      zone: {
        mittelpunkt: { lat: this.demoSpielerLat, lng: this.demoSpielerLng },
        radiusMeter: 800
      },
      restSekundenPhase: 1800,
      serverZeit: Date.now()
    };

    this.benachrichtigeHandler({
      typ: 'zustand',
      daten: snapshot
    });

    this.sendeDemoSichtPositionen();
  }

  private sendeDemoSichtPositionen(): void {
    const sichtbarePositionen = this.demoBots.map((b) => ({
      spielerId: b.id,
      name: b.name,
      farbe: b.farbe,
      icon: b.icon,
      rolle: b.rolle,
      lat: b.lat,
      lng: b.lng,
      genauigkeit: 8,
      typ: 'live' as const,
      zeitpunkt: Date.now()
    }));

    this.benachrichtigeHandler({
      typ: 'sicht',
      daten: { sichtbarePositionen }
    });
  }

  private verarbeiteDemoAktion(
    typ: AusgehendeNachricht['typ'],
    payload: unknown
  ): void {
    const daten = payload as Record<string, unknown>;

    if (typ === 'ort') {
      const ort = daten as { lat: number; lng: number };
      this.demoSpielerLat = ort.lat;
      this.demoSpielerLng = ort.lng;
      this.pruefeDemoFangenAutomatisch();
      return;
    }

    if (typ === 'host_start' || typ === 'host') {
      const aktion = daten?.aktion;
      if (aktion === 'start') {
        this.demoPhase = 'jagd';
        this.benachrichtigeHandler({
          typ: 'ereignis',
          daten: {
            id: 'ev-start',
            zeit: Date.now(),
            typ: 'phase',
            daten: { phase: 'jagd' }
          }
        });
        this.sendeDemoZustand();
      }
      return;
    }

    if (typ === 'fangen') {
      const zielId = daten?.zielId as string;
      const bot = this.demoBots.find((b) => b.id === zielId);
      if (bot && !bot.gefangen) {
        bot.gefangen = true;
        this.benachrichtigeHandler({
          typ: 'ereignis',
          daten: {
            id: `ev-catch-${Date.now()}`,
            zeit: Date.now(),
            typ: 'gefangen',
            daten: { zielId: bot.id, faengerId: this.spielerId }
          }
        });
        this.sendeDemoZustand();
      }
      return;
    }

    if (typ === 'ping') {
      this.benachrichtigeHandler({
        typ: 'pong',
        zeit: (daten?.zeit as number) || Date.now(),
        daten: { serverZeit: Date.now() }
      });
      return;
    }

    if (typ === 'chat') {
      this.benachrichtigeHandler({
        typ: 'ereignis',
        daten: {
          id: `ev-chat-${Date.now()}`,
          zeit: Date.now(),
          typ: 'chat',
          daten: {
            senderId: this.spielerId,
            senderName: 'Du',
            kanal: daten.kanal,
            text: daten.text
          }
        }
      });
    }
  }

  private pruefeDemoFangenAutomatisch(): void {
    if (this.demoPhase !== 'jagd') {
      return;
    }

    for (const bot of this.demoBots) {
      if (bot.rolle === 'hider' && !bot.gefangen) {
        const dLat = (bot.lat - this.demoSpielerLat) * 111320;
        const dLng =
          (bot.lng - this.demoSpielerLng) *
          (40075000 * Math.cos((this.demoSpielerLat * Math.PI) / 180) / 360);
        const distanz = Math.sqrt(dLat * dLat + dLng * dLng);

        if (distanz <= 15) {
          bot.gefangen = true;
          this.benachrichtigeHandler({
            typ: 'ereignis',
            daten: {
              id: `ev-auto-catch-${Date.now()}`,
              zeit: Date.now(),
              typ: 'gefangen',
              daten: { zielId: bot.id, faengerId: this.spielerId, distanz }
            }
          });
          this.sendeDemoZustand();
        }
      }
    }
  }

  public sendHallo(
    spitzname: string,
    icon: string,
    farbe: string,
    token: string = '',
    rolle: string = 'hider'
  ): void {
    const payload = { id: this.spielerId, spitzname, icon, farbe, rolle, token };
    this.letzteHallo = { typ: 'hallo', payload, zeit: Date.now() };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.senden('hallo', payload);
    }
  }

  public sendOrt(ort: {
    lat: number;
    lng: number;
    genauigkeit: number;
    zeit: number;
    tempo?: number;
  }): void {
    this.senden('ort', ort);
  }

  public sendFangen(zielId: string): void {
    this.senden('fangen', { zielId });
  }

  public sendFangAntwort(fangId: string, bestaetigt: boolean): void {
    this.senden('fangAntwort', { fangId, bestaetigt });
  }

  public sendFaehigkeit(
    id: string,
    params?: { zielId?: string; lat?: number; lng?: number }
  ): void {
    this.senden('faehigkeit', { faehigkeitId: id, ...params });
  }

  public sendTicket(ticket: {
    verkehrsmittel: string;
    haltestelle?: string;
    linie?: string;
    spezial?: string;
  }): void {
    const ticketTyp = ticket.verkehrsmittel === 'doppel' ? 'doppelzug' : ticket.verkehrsmittel;
    this.senden('ticket', {
      ticketTyp,
      haltestelle: ticket.haltestelle,
      linie: ticket.linie,
      spezial: ticket.spezial,
    });
  }

  public sendChat(kanal: 'alle' | 'team' | 'zuschauer', text: string): void {
    this.senden('chat', { kanal, text });
  }

  public sendHost(aktion: string, daten: Record<string, unknown> = {}): void {
    if (aktion === 'start') this.senden('host_start', daten);
    if (aktion === 'setup') this.senden('host_setup', daten);
  }
}

export const spielNetz = new GameSocket();
