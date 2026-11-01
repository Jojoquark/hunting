import { WebSocket } from 'ws';
import {
  C2SMessage,
  Koordinate,
  Rolle,
  S2CMessage,
  SichtbarePosition,
  SpielPhase,
  SpielerZustand,
  ZonenZustand
} from './types.js';
import {
  berechneAbstandMeter,
  bewegeInRichtung,
  bewegeRichtungZiel,
  bewegeWegVonZiel,
  erzeugeZufaelligenPunktInZone
} from './movement.js';

export interface BotOptionen {
  id: string;
  spitzname: string;
  rolle: Rolle;
  startPosition: Koordinate;
  geschwindigkeitMeterProSekunde?: number;
  autoFangAntwort?: boolean;
}

export class HeadlessBot {
  public id: string;
  public spitzname: string;
  public rolle: Rolle;
  public position: Koordinate;
  public geschwindigkeit: number;
  public gefangen = false;
  public energie = 100;
  public phase: SpielPhase = 'lobby';
  public zone?: ZonenZustand;
  public sichtbarePositionen: Map<string, SichtbarePosition> = new Map();
  public spielerListe: SpielerZustand[] = [];

  private ws: WebSocket | null = null;
  private wsUrl: string;
  private updateIntervall: NodeJS.Timeout | null = null;
  private schrittIntervallMs = 1000;
  private autoFangAntwort: boolean;
  private transitStopps: Koordinate[] = [];
  private aktuellerStoppIndex = 0;

  constructor(wsUrl: string, optionen: BotOptionen) {
    this.wsUrl = wsUrl;
    this.id = optionen.id;
    this.spitzname = optionen.spitzname;
    this.rolle = optionen.rolle;
    this.position = { ...optionen.startPosition };
    this.geschwindigkeit = optionen.geschwindigkeitMeterProSekunde ?? (this.rolle === 'seeker' ? 3.5 : 2.5);
    this.autoFangAntwort = optionen.autoFangAntwort ?? true;
  }

  public async verbinden(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.sende({
          typ: 'hallo',
          spitzname: this.spitzname,
          icon: this.rolle === 'seeker' ? 'shield' : 'user'
        });
        resolve();
      });

      this.ws.on('message', (daten: string) => {
        try {
          const nachricht: S2CMessage = JSON.parse(daten);
          this.verarbeiteNachricht(nachricht);
        } catch {}
      });

      this.ws.on('error', (err) => reject(err));
    });
  }

  public trennen(): void {
    if (this.updateIntervall) {
      clearInterval(this.updateIntervall);
      this.updateIntervall = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public starteBewegung(schrittIntervallMs = 1000, zeitRaffer = 1): void {
    this.schrittIntervallMs = schrittIntervallMs;
    this.updateIntervall = setInterval(() => {
      this.simuliereSchritt(zeitRaffer);
    }, schrittIntervallMs);
  }

  public sende(nachricht: C2SMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(nachricht));
    }
  }

  private verarbeiteNachricht(nachricht: S2CMessage): void {
    switch (nachricht.typ) {
      case 'zustand':
        this.phase = nachricht.phase;
        this.zone = nachricht.zone;
        this.spielerListe = nachricht.spieler;
        const ich = nachricht.spieler.find((s) => s.id === this.id);
        if (ich) {
          this.gefangen = ich.gefangen;
          this.energie = ich.energie;
          this.rolle = ich.rolle;
        }
        break;

      case 'sicht':
        this.sichtbarePositionen.clear();
        for (const pos of nachricht.positionen) {
          this.sichtbarePositionen.set(pos.spielerId, pos);
        }
        break;

      case 'fangAnfrage':
        if (this.autoFangAntwort) {
          this.sende({
            typ: 'fangAntwort',
            fangId: nachricht.fangId,
            bestaetigt: true
          });
        }
        break;

      case 'ereignis':
        if (nachricht.art === 'gefangen' && nachricht.payload?.zielId === this.id) {
          this.gefangen = true;
        }
        break;
    }
  }

  private simuliereSchritt(zeitRaffer: number): void {
    if (this.phase !== 'jagd' && this.phase !== 'verstecken') {
      return;
    }

    const distanz = this.geschwindigkeit * (this.schrittIntervallMs / 1000) * zeitRaffer;

    if (this.rolle === 'seeker' || this.rolle === 'zombie' || this.rolle === 'detektiv') {
      this.schrittJaeger(distanz);
    } else if (this.rolle === 'hider') {
      this.schrittGejagter(distanz);
    } else if (this.rolle === 'mrx') {
      this.schrittMrX(distanz);
    }

    this.sende({
      typ: 'ort',
      lat: this.position.lat,
      lng: this.position.lng,
      genauigkeit: 5.0,
      zeit: Date.now(),
      tempo: this.geschwindigkeit
    });
  }

  private schrittJaeger(distanz: number): void {
    let ziel: SichtbarePosition | null = null;
    let minAbstand = Infinity;

    for (const [id, pos] of this.sichtbarePositionen.entries()) {
      const sp = this.spielerListe.find((s) => s.id === id);
      if (sp && !sp.gefangen && (sp.team === 'hider' || sp.rolle === 'mrx')) {
        const abstand = berechneAbstandMeter(this.position, pos);
        if (abstand < minAbstand) {
          minAbstand = abstand;
          ziel = pos;
        }
      }
    }

    if (ziel) {
      this.position = bewegeRichtungZiel(this.position, ziel, distanz);
      if (minAbstand <= 25) {
        this.sende({ typ: 'fangen', zielId: ziel.spielerId });
      }
    } else if (this.zone) {
      const zentrum = this.zone.aktuell.mittelpunkt;
      const abstandZumZentrum = berechneAbstandMeter(this.position, zentrum);
      if (abstandZumZentrum > this.zone.aktuell.radiusMeter * 0.8) {
        this.position = bewegeRichtungZiel(this.position, zentrum, distanz);
      } else {
        const theta = Math.random() * 360;
        this.position = bewegeInRichtung(this.position, distanz, theta);
      }
    }
  }

  private schrittGejagter(distanz: number): void {
    if (this.gefangen) return;

    let gefahrInNaehe: SichtbarePosition | null = null;
    for (const [, pos] of this.sichtbarePositionen.entries()) {
      const abstand = berechneAbstandMeter(this.position, pos);
      if (abstand < 120) {
        gefahrInNaehe = pos;
        break;
      }
    }

    if (gefahrInNaehe) {
      if (this.energie >= 70 && Math.random() < 0.2) {
        this.sende({ typ: 'faehigkeit', id: 'schild' });
      } else if (this.energie >= 50 && Math.random() < 0.3) {
        this.sende({ typ: 'faehigkeit', id: 'stoersender' });
      }
      this.position = bewegeWegVonZiel(this.position, gefahrInNaehe, distanz);
    } else if (this.zone) {
      const zentrum = this.zone.aktuell.mittelpunkt;
      const abstandZumZentrum = berechneAbstandMeter(this.position, zentrum);
      if (abstandZumZentrum > this.zone.aktuell.radiusMeter * 0.85) {
        this.position = bewegeRichtungZiel(this.position, zentrum, distanz);
      } else {
        const zufallWeg = erzeugeZufaelligenPunktInZone(this.position, distanz);
        this.position = zufallWeg;
      }
    }
  }

  private schrittMrX(distanz: number): void {
    if (this.gefangen) return;

    if (this.transitStopps.length === 0 && this.zone) {
      const zentrum = this.zone.aktuell.mittelpunkt;
      for (let i = 0; i < 6; i++) {
        this.transitStopps.push(erzeugeZufaelligenPunktInZone(zentrum, this.zone.aktuell.radiusMeter * 0.7));
      }
    }

    if (this.transitStopps.length > 0) {
      const zielStopp = this.transitStopps[this.aktuellerStoppIndex];
      const abstand = berechneAbstandMeter(this.position, zielStopp);
      if (abstand <= distanz * 2) {
        this.aktuellerStoppIndex = (this.aktuellerStoppIndex + 1) % this.transitStopps.length;
        const verkehrsmittel = Math.random() > 0.5 ? 'u-bahn' : 'bus';
        this.sende({
          typ: 'ticket',
          verkehrsmittel: verkehrsmittel as any,
          linie: 'U1',
          spezial: Math.random() < 0.2 ? 'black' : undefined
        });
      } else {
        this.position = bewegeRichtungZiel(this.position, zielStopp, distanz * 1.5);
      }
    }
  }
}
