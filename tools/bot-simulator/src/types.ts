export type Rolle = 'host' | 'seeker' | 'hider' | 'zombie' | 'detektiv' | 'mrx' | 'zuschauer';
export type Modus = 'klassisch' | 'zombie' | 'mrx';
export type SpielPhase = 'lobby' | 'verstecken' | 'jagd' | 'ende';

export interface Koordinate {
  lat: number;
  lng: number;
}

export interface ZonenStufe {
  stufe: number;
  mittelpunkt: Koordinate;
  radiusMeter: number;
  startZeitSekunden: number;
  schrumpfDauerSekunden: number;
}

export interface ZonenZustand {
  aktuell: {
    mittelpunkt: Koordinate;
    radiusMeter: number;
  };
  naechste?: {
    mittelpunkt: Koordinate;
    radiusMeter: number;
    startZeitSekunden: number;
  };
  schrumpftGerade: boolean;
}

export interface SpielerZustand {
  id: string;
  spitzname: string;
  rolle: Rolle;
  team: 'seeker' | 'hider' | 'zombie' | 'zuschauer';
  energie: number;
  gefangen: boolean;
  online: boolean;
  letztePosition?: {
    lat: number;
    lng: number;
    zeit: number;
  };
}

export interface SichtbarePosition {
  spielerId: string;
  lat: number;
  lng: number;
  art: 'live' | 'unscharf' | 'ping';
  zeit: number;
}

export type C2SMessage =
  | { typ: 'hallo'; spitzname: string; icon: string; token?: string }
  | { typ: 'ort'; lat: number; lng: number; genauigkeit: number; zeit: number; tempo: number }
  | { typ: 'fangen'; zielId: string }
  | { typ: 'fangAntwort'; fangId: string; bestaetigt: boolean }
  | { typ: 'qrFang'; token: string }
  | { typ: 'faehigkeit'; id: string; parameter?: unknown }
  | {
      typ: 'ticket';
      verkehrsmittel: 'bus' | 'tram' | 'u-bahn' | 's-bahn' | 'zug' | 'faehre';
      haltestelle?: string;
      linie?: string;
      spezial?: 'black' | 'doppelzug';
    }
  | { typ: 'chat'; kanal: 'alle' | 'team' | 'zuschauer'; text: string }
  | { typ: 'host'; aktion: 'start' | 'beenden' | 'einstellungen' | 'rollen'; parameter?: unknown };

export type S2CMessage =
  | {
      typ: 'zustand';
      phase: SpielPhase;
      spieler: SpielerZustand[];
      zone: ZonenZustand;
      restzeitSekunden: number;
      naechsterPingSekunden: number;
    }
  | {
      typ: 'ereignis';
      art: 'ping' | 'zone' | 'gefangen' | 'faehigkeit' | 'ticket' | 'aufdeckung' | 'chat' | 'phase';
      payload: any;
    }
  | { typ: 'sicht'; positionen: SichtbarePosition[] }
  | { typ: 'zeit'; serverZeit: number }
  | { typ: 'fangAnfrage'; fangId: string; vonSpielerId: string; vonSpitzname: string };
