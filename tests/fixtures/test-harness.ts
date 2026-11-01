import {
  C2SMessage,
  Koordinate,
  Modus,
  Rolle,
  S2CMessage,
  SpielPhase,
  SpielerZustand,
  ZonenZustand
} from '../../tools/bot-simulator/src/types.js';
import { berechneAbstandMeter } from '../../tools/bot-simulator/src/movement.js';

export interface TestSpieler {
  id: string;
  spitzname: string;
  rolle: Rolle;
  team: 'seeker' | 'hider' | 'zombie' | 'zuschauer';
  position?: Koordinate;
  letztePositionsZeit?: number;
  letzteAktiveVerbindung?: number;
  energie: number;
  gefangen: boolean;
  online: boolean;
  funklochStrafeBis?: number;
  schildAktivBis?: number;
  stoersenderAktivBis?: number;
  koederPunkt?: Koordinate;
  radarAktivBis?: number;
  sekundenAusserhalbZone: number;
  empfangeneNachrichten: S2CMessage[];
}

export class MockGameRoom {
  public code: string;
  public modus: Modus;
  public phase: SpielPhase = 'lobby';
  public spieler: Map<string, TestSpieler> = new Map();
  public zone: ZonenZustand;
  public fangDistanz = 25;
  public fangHistorie: Array<{ zielId: string; vonId: string; zeit: number }> = [];
  public ereignisLog: Array<{ art: string; payload: any }> = [];
  public verdaechtigeSpruenge: Map<string, number> = new Map();
  public mrxAufdeckModus: 'tickets' | 'entfernung' | 'zeit' = 'tickets';
  public mrxTicketZaehler = 0;
  public mrxDoppelzugAktiv = false;
  public mrxLetzterAufdeckPunkt?: Koordinate;
  public detektivTempoWarnungen: string[] = [];

  constructor(code = 'TEST01', modus: Modus = 'klassisch') {
    this.code = code;
    this.modus = modus;
    this.zone = {
      aktuell: {
        mittelpunkt: { lat: 52.52, lng: 13.405 },
        radiusMeter: 1000
      },
      schrumpftGerade: false
    };
  }

  public beitritt(id: string, spitzname: string, rolle: Rolle): TestSpieler {
    let team: 'seeker' | 'hider' | 'zombie' | 'zuschauer' = 'hider';
    if (rolle === 'seeker' || rolle === 'detektiv') team = 'seeker';
    if (rolle === 'zombie') team = 'zombie';

    const sp: TestSpieler = {
      id,
      spitzname,
      rolle,
      team,
      energie: 100,
      gefangen: false,
      online: true,
      sekundenAusserhalbZone: 0,
      empfangeneNachrichten: []
    };
    this.spieler.set(id, sp);
    this.broadcastZustand();
    return sp;
  }

  public trenne(id: string): void {
    const sp = this.spieler.get(id);
    if (sp) {
      sp.online = false;
      this.broadcastZustand();
    }
  }

  public verbindeWieder(id: string): void {
    const sp = this.spieler.get(id);
    if (sp) {
      sp.online = true;
      if (sp.letztePositionsZeit && Date.now() - sp.letztePositionsZeit > 90000) {
        sp.funklochStrafeBis = Date.now() + 60000;
        this.ereignisLog.push({ art: 'funklochStrafe', payload: { spielerId: id } });
      }
      this.broadcastZustand();
    }
  }

  public empfange(id: string, nachricht: C2SMessage): void {
    const sp = this.spieler.get(id);
    if (!sp) return;

    switch (nachricht.typ) {
      case 'host':
        if (nachricht.aktion === 'start') {
          this.phase = 'verstecken';
          this.ereignisLog.push({ art: 'phase', payload: 'verstecken' });
          this.broadcastZustand();
        }
        break;

      case 'ort':
        this.verarbeiteOrt(sp, nachricht.lat, nachricht.lng, nachricht.zeit);
        break;

      case 'fangen':
        this.verarbeiteFang(sp, nachricht.zielId);
        break;

      case 'faehigkeit':
        this.verarbeiteFaehigkeit(sp, nachricht.id, nachricht.parameter);
        break;

      case 'ticket':
        this.verarbeiteTicket(sp, nachricht.verkehrsmittel, nachricht.spezial);
        break;
    }
  }

  public wechsleZuJagd(): void {
    this.phase = 'jagd';
    this.ereignisLog.push({ art: 'phase', payload: 'jagd' });
    this.broadcastZustand();
  }

  public loesePingAus(): void {
    const pingPositionen: Array<{ spielerId: string; lat: number; lng: number }> = [];
    const jetzt = Date.now();

    for (const sp of this.spieler.values()) {
      if ((sp.team === 'hider' || sp.rolle === 'mrx') && !sp.gefangen) {
        if (sp.letztePositionsZeit && jetzt - sp.letztePositionsZeit > 90000) {
          sp.funklochStrafeBis = jetzt + 60000;
          this.ereignisLog.push({
            art: 'pingSignalVerloren',
            payload: { spielerId: sp.id, letztePosition: sp.position }
          });
        } else if (sp.koederPunkt) {
          pingPositionen.push({ spielerId: sp.id, ...sp.koederPunkt });
          sp.koederPunkt = undefined;
        } else if (sp.position) {
          pingPositionen.push({ spielerId: sp.id, ...sp.position });
        }
      }
    }

    this.ereignisLog.push({ art: 'ping', payload: { positionen: pingPositionen } });
    this.broadcastSicht();
  }

  private verarbeiteOrt(sp: TestSpieler, lat: number, lng: number, zeit: number): void {
    const neuePos = { lat, lng };
    if (sp.position && sp.letztePositionsZeit) {
      const dt = Math.max(0.1, (zeit - sp.letztePositionsZeit) / 1000);
      const distanz = berechneAbstandMeter(sp.position, neuePos);
      const v = distanz / dt;
      if (v > 50) {
        const count = (this.verdaechtigeSpruenge.get(sp.id) || 0) + 1;
        this.verdaechtigeSpruenge.set(sp.id, count);
        this.ereignisLog.push({ art: 'antiCheatVerdacht', payload: { spielerId: sp.id, v } });
        return;
      }
    }

    sp.position = neuePos;
    sp.letztePositionsZeit = zeit;

    const abstandZentrum = berechneAbstandMeter(neuePos, this.zone.aktuell.mittelpunkt);
    const ausserhalb = abstandZentrum > this.zone.aktuell.radiusMeter;

    if (ausserhalb) {
      sp.sekundenAusserhalbZone += 5;
      if (sp.sekundenAusserhalbZone >= 60 && !sp.gefangen) {
        sp.gefangen = true;
        this.ereignisLog.push({
          art: 'autoFangZoneVerlassen',
          payload: { spielerId: sp.id }
        });
        this.pruefeSpielEnde();
      }
    } else {
      sp.sekundenAusserhalbZone = 0;
    }

    this.broadcastSicht();
  }

  private verarbeiteFang(seeker: TestSpieler, zielId: string): void {
    const ziel = this.spieler.get(zielId);
    if (!ziel || ziel.gefangen || !seeker.position || !ziel.position) return;

    if (ziel.schildAktivBis && Date.now() < ziel.schildAktivBis) {
      this.ereignisLog.push({ art: 'fangAbgelehnt', payload: { grund: 'schild' } });
      return;
    }

    for (const s of this.spieler.values()) {
      if (s.stoersenderAktivBis && Date.now() < s.stoersenderAktivBis && s.position) {
        if (berechneAbstandMeter(seeker.position, s.position) <= 150) {
          this.ereignisLog.push({ art: 'fangAbgelehnt', payload: { grund: 'stoersender' } });
          return;
        }
      }
    }

    const distanz = berechneAbstandMeter(seeker.position, ziel.position);
    if (distanz <= this.fangDistanz) {
      if (this.modus === 'zombie') {
        ziel.rolle = 'zombie';
        ziel.team = 'zombie';
      } else {
        ziel.gefangen = true;
        ziel.team = 'zuschauer';
      }
      this.fangHistorie.push({ zielId, vonId: seeker.id, zeit: Date.now() });
      this.ereignisLog.push({ art: 'gefangen', payload: { zielId, vonId: seeker.id } });
      this.pruefeSpielEnde();
      this.broadcastZustand();
    }
  }

  private verarbeiteFaehigkeit(sp: TestSpieler, id: string, param: any): void {
    const jetzt = Date.now();
    if (id === 'schild' && sp.energie >= 70) {
      sp.energie -= 70;
      sp.schildAktivBis = jetzt + 30000;
      this.ereignisLog.push({ art: 'faehigkeit', payload: { spielerId: sp.id, f: 'schild' } });
    } else if (id === 'stoersender' && sp.energie >= 50) {
      sp.energie -= 50;
      sp.stoersenderAktivBis = jetzt + 60000;
      this.ereignisLog.push({ art: 'faehigkeit', payload: { spielerId: sp.id, f: 'stoersender' } });
    } else if (id === 'koeder' && sp.energie >= 50 && param?.punkt) {
      sp.energie -= 50;
      sp.koederPunkt = param.punkt;
      this.ereignisLog.push({ art: 'faehigkeit', payload: { spielerId: sp.id, f: 'koeder' } });
    } else if (id === 'radar' && sp.energie >= 40) {
      sp.energie -= 40;
      sp.radarAktivBis = jetzt + 15000;
      this.ereignisLog.push({ art: 'faehigkeit', payload: { spielerId: sp.id, f: 'radar' } });
    } else if (id === 'sonar' && sp.energie >= 30 && sp.position) {
      sp.energie -= 30;
      let count = 0;
      for (const h of this.spieler.values()) {
        if (h.team === 'hider' && !h.gefangen && h.position) {
          if (berechneAbstandMeter(sp.position, h.position) <= 250) count++;
        }
      }
      sp.empfangeneNachrichten.push({
        typ: 'ereignis',
        art: 'faehigkeit',
        payload: { f: 'sonar', count }
      });
    }
    this.broadcastZustand();
  }

  private verarbeiteTicket(sp: TestSpieler, typ: string, spezial?: string): void {
    if (spezial === 'doppelzug') {
      this.mrxDoppelzugAktiv = true;
      this.ereignisLog.push({ art: 'ticket', payload: { spezial: 'doppelzug' } });
      return;
    }

    if (!this.mrxDoppelzugAktiv) {
      this.mrxTicketZaehler++;
    } else {
      this.mrxDoppelzugAktiv = false;
    }

    const payload = {
      verkehrsmittel: spezial === 'black' ? 'black' : typ,
      ticketZaehler: this.mrxTicketZaehler
    };
    this.ereignisLog.push({ art: 'ticket', payload });

    if (this.mrxAufdeckModus === 'tickets' && this.mrxTicketZaehler % 3 === 0 && sp.position) {
      this.ereignisLog.push({ art: 'aufdeckung', payload: { position: sp.position } });
    }
  }

  private pruefeSpielEnde(): void {
    const aktiveGejagte = Array.from(this.spieler.values()).filter(
      (s) => (s.team === 'hider' || s.rolle === 'mrx') && !s.gefangen
    );
    if (aktiveGejagte.length === 0) {
      this.phase = 'ende';
      this.ereignisLog.push({ art: 'phase', payload: 'ende' });
    }
  }

  private broadcastZustand(): void {
    const zst: SpielerZustand[] = Array.from(this.spieler.values()).map((s) => ({
      id: s.id,
      spitzname: s.spitzname,
      rolle: s.rolle,
      team: s.team,
      energie: s.energie,
      gefangen: s.gefangen,
      online: s.online,
      letztePosition: s.position
        ? { lat: s.position.lat, lng: s.position.lng, zeit: s.letztePositionsZeit || Date.now() }
        : undefined
    }));

    const nachricht: S2CMessage = {
      typ: 'zustand',
      phase: this.phase,
      spieler: zst,
      zone: this.zone,
      restzeitSekunden: 3600,
      naechsterPingSekunden: 300
    };

    for (const sp of this.spieler.values()) {
      sp.empfangeneNachrichten.push(nachricht);
    }
  }

  private broadcastSicht(): void {
    const jetzt = Date.now();
    for (const betrachter of this.spieler.values()) {
      const posListe: Array<{ spielerId: string; lat: number; lng: number; art: 'live' | 'unscharf' | 'ping'; zeit: number }> = [];

      for (const ziel of this.spieler.values()) {
        if (!ziel.position || ziel.id === betrachter.id) continue;

        if (betrachter.team === 'seeker' && ziel.team === 'seeker') {
          posListe.push({ spielerId: ziel.id, ...ziel.position, art: 'live', zeit: jetzt });
        } else if (betrachter.team === 'hider' && betrachter.radarAktivBis && jetzt < betrachter.radarAktivBis && ziel.team === 'seeker') {
          posListe.push({ spielerId: ziel.id, ...ziel.position, art: 'live', zeit: jetzt });
        } else if (ziel.funklochStrafeBis && jetzt < ziel.funklochStrafeBis) {
          posListe.push({ spielerId: ziel.id, ...ziel.position, art: 'live', zeit: jetzt });
        } else if (ziel.sekundenAusserhalbZone > 0) {
          posListe.push({ spielerId: ziel.id, ...ziel.position, art: 'live', zeit: jetzt });
        } else if (this.modus === 'zombie' && betrachter.team === 'hider' && ziel.rolle === 'zombie') {
          const rasterLat = Math.round(ziel.position.lat * 2000) / 2000;
          const rasterLng = Math.round(ziel.position.lng * 2000) / 2000;
          posListe.push({ spielerId: ziel.id, lat: rasterLat, lng: rasterLng, art: 'unscharf', zeit: jetzt });
        }
      }

      betrachter.empfangeneNachrichten.push({
        typ: 'sicht',
        positionen: posListe
      });
    }
  }
}
