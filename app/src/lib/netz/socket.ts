/**
 * HUNTING - WebSocket Client & Zustandsverwaltung
 * Verbindet sich mit dem Cloudflare Worker Durable Object GameRoom.
 * Bietet automatischen Reconnect mit exponentiellem Backoff, Offline-Warteschlange
 * und exakte Uhren-Synchronisation für synchrone Countdowns.
 */

export type VerbindungsStatus = 'getrennt' | 'verbinde' | 'verbunden' | 'reconnect';

export interface ServerZeitSync {
  rtt: number;
  offset: number; // serverZeit = Date.now() + offset
  letzterAbgleich: number;
}

export interface AusgehendeNachricht {
  typ: 'hallo' | 'ort' | 'fangen' | 'fangAntwort' | 'qrFang' | 'faehigkeit' | 'ticket' | 'chat' | 'host' | 'ping';
  payload: any;
  zeit: number;
}

export interface EingehendeNachricht {
  typ: 'zustand' | 'ereignis' | 'sicht' | 'zeit' | 'pong' | 'fehler';
  daten: any;
  zeit?: number;
}

export type NachrichtenHandler = (msg: EingehendeNachricht) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectVersuch = 0;
  private maxReconnectPause = 10000;
  private reconnectTimer: number | null = null;
  private pingIntervallTimer: number | null = null;

  private offlineWarteschlange: AusgehendeNachricht[] = [];
  private handler: Set<NachrichtenHandler> = new Set();
  
  public status: VerbindungsStatus = 'getrennt';
  public sync: ServerZeitSync = { rtt: 0, offset: 0, letzterAbgleich: 0 };
  public spielCode: string = '';
  public spielerId: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if ((this.status === 'reconnect' || this.status === 'getrennt') && this.url) {
          if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.reconnectVersuch = 0;
          this.setStatus('reconnect');
          this.initialisiereWebSocket();
        }
      });
    }
  }

  /**
   * Startet die Verbindung zum Durable Object
   * URL-Muster: wss://<worker-domain>/spiele/:code/ws?token=<token>&spielerId=<id>
   */
  public verbinden(basisUrl: string, code: string, spielerId: string, token: string = ''): void {
    this.spielCode = code.toUpperCase();
    this.spielerId = spielerId;
    
    // Protokoll angleichen (ws:// bzw. wss://)
    const protocol = basisUrl.startsWith('https') ? 'wss:' : basisUrl.startsWith('http') ? 'ws:' : 'wss:';
    const host = basisUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    this.url = `${protocol}//${host}/spiele/${this.spielCode}/ws?spielerId=${encodeURIComponent(spielerId)}&token=${encodeURIComponent(token)}`;

    this.setStatus('verbinde');
    this.initialisiereWebSocket();
  }

  private initialisiereWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignorieren
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.setStatus('verbunden');
        this.reconnectVersuch = 0;
        this.sendeZeitSyncPing();
        this.starteHeartbeat();
        this.leereWarteschlange();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const nachricht: EingehendeNachricht = JSON.parse(event.data);
          this.verarbeiteNachricht(nachricht);
        } catch (err) {
          console.error('[HUNTING Net] Ungültige WebSocket-Nachricht empfangen:', event.data, err);
        }
      };

      this.ws.onclose = () => {
        this.stoppeHeartbeat();
        if (this.status !== 'getrennt') {
          this.setStatus('reconnect');
          this.planeReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[HUNTING Net] WebSocket Fehler:', err);
      };
    } catch (err) {
      console.error('[HUNTING Net] Verbindungsaufbau fehlgeschlagen:', err);
      this.planeReconnect();
    }
  }

  private setStatus(neuerStatus: VerbindungsStatus): void {
    this.status = neuerStatus;
    this.benachrichtigeHandler({
      typ: 'zustand',
      daten: { __status: neuerStatus },
    });
  }

  private planeReconnect(): void {
    if (this.reconnectTimer !== null) return;

    this.reconnectVersuch++;
    // Exponentieller Backoff mit Jitter: 500ms, 750ms, 1125ms... max 10s
    const basisPause = Math.min(this.maxReconnectPause, 500 * Math.pow(1.5, this.reconnectVersuch));
    const jitter = Math.random() * 300;
    const wartezeit = basisPause + jitter;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.status === 'reconnect') {
        this.initialisiereWebSocket();
      }
    }, wartezeit);
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

  /**
   * Misst RTT und synchronisiert die Uhr mit dem Server
   */
  private sendeZeitSyncPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        typ: 'ping',
        zeit: Date.now(),
      }));
    }
  }

  private verarbeiteNachricht(msg: EingehendeNachricht): void {
    if (msg.typ === 'pong' && typeof msg.zeit === 'number') {
      const now = Date.now();
      const clientSendTime = msg.zeit;
      const rtt = Math.max(1, now - clientSendTime);
      const serverTime = msg.daten?.serverZeit ?? now;
      // Schätzung: Serverzeit zum Zeitpunkt des Empfangs = serverTime - (rtt / 2)
      const offset = serverTime - (clientSendTime + rtt / 2);

      this.sync = {
        rtt,
        offset,
        letzterAbgleich: now,
      };
      return;
    }

    if (msg.typ === 'zeit' && typeof msg.daten?.serverZeit === 'number') {
      const now = Date.now();
      this.sync.offset = msg.daten.serverZeit - now;
      this.sync.letzterAbgleich = now;
      return;
    }

    this.benachrichtigeHandler(msg);
  }

  private benachrichtigeHandler(msg: EingehendeNachricht): void {
    for (const h of this.handler) {
      try {
        h(msg);
      } catch (err) {
        console.error('[HUNTING Net] Fehler in Nachrichten-Handler:', err);
      }
    }
  }

  /**
   * Sendet eine Nachricht an den Server oder reiht sie bei Offline-Zustand ein
   */
  public senden(typ: AusgehendeNachricht['typ'], payload: any): void {
    const nachricht: AusgehendeNachricht = {
      typ,
      payload,
      zeit: Date.now(),
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(nachricht));
        return;
      } catch (err) {
        console.warn('[HUNTING Net] Senden fehlgeschlagen, speichere in Warteschlange:', err);
      }
    }

    // Für Standort-Updates: Nur die allerletzte Position behalten, um Überflutung zu vermeiden
    if (typ === 'ort') {
      this.offlineWarteschlange = this.offlineWarteschlange.filter((n) => n.typ !== 'ort');
    }

    this.offlineWarteschlange.push(nachricht);
  }

  private leereWarteschlange(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.offlineWarteschlange.length > 0) {
      const naechste = this.offlineWarteschlange.shift();
      if (naechste) {
        try {
          this.ws.send(JSON.stringify(naechste));
        } catch (err) {
          console.error('[HUNTING Net] Fehler beim Leeren der Warteschlange:', err);
          this.offlineWarteschlange.unshift(naechste);
          break;
        }
      }
    }
  }

  /**
   * Liefert die exakte aktuelle Serverzeit in ms
   */
  public getAktuelleServerZeit(): number {
    return Date.now() + this.sync.offset;
  }

  public abonnieren(callback: NachrichtenHandler): () => void {
    this.handler.add(callback);
    return () => this.handler.delete(callback);
  }

  public trennen(): void {
    this.stoppeHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.status = 'getrennt';
    if (this.ws) {
      try {
        this.ws.close(1000, 'Absichtlicher Client-Disconnect');
      } catch (e) {}
      this.ws = null;
    }
  }

  // --- Spezifische Komfort-Methoden für Gameplay ---

  public sendHallo(spitzname: string, icon: string, farbe: string, token: string = ''): void {
    this.senden('hallo', { spitzname, icon, farbe, token });
  }

  public sendOrt(ort: { lat: number; lng: number; genauigkeit: number; zeit: number; tempo?: number }): void {
    this.senden('ort', ort);
  }

  public sendFangen(zielId: string): void {
    this.senden('fangen', { zielId });
  }

  public sendFangAntwort(fangId: string, bestaetigt: boolean): void {
    this.senden('fangAntwort', { fangId, bestaetigt });
  }

  public sendQrFang(zielId: string, token: string): void {
    this.senden('qrFang', { zielId, token });
  }

  public sendFaehigkeit(id: string, params?: { zielId?: string; lat?: number; lng?: number }): void {
    this.senden('faehigkeit', { id, ...params });
  }

  public sendTicket(ticket: { verkehrsmittel: string; haltestelle?: string; linie?: string; spezial?: string }): void {
    this.senden('ticket', ticket);
  }

  public sendChat(kanal: 'alle' | 'team' | 'zuschauer', text: string): void {
    this.senden('chat', { kanal, text });
  }

  public sendHost(aktion: string, daten: any = {}): void {
    this.senden('host', { aktion, ...daten });
  }
}

// Globales Singleton
export const spielNetz = new GameSocket();
