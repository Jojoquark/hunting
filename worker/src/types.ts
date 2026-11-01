export type SpielModus = 'klassisch' | 'zombie' | 'mrx';
export type SpielPhase = 'lobby' | 'verstecken' | 'jagd' | 'ende';
export type Rolle = 'seeker' | 'hider' | 'zuschauer' | 'zombie' | 'mensch' | 'mrx' | 'detektiv';

export interface Koordinate {
  lat: number;
  lng: number;
}

export interface Position extends Koordinate {
  genauigkeit: number; // Meter
  zeit: number;       // Unix-Zeitstempel (ms)
  tempo?: number;     // m/s
}

export type SichtbarkeitArt = 'unsichtbar' | 'ping' | 'unscharf' | 'live';

export type SichtbarkeitErgebnis =
  | { art: 'unsichtbar' }
  | { art: 'live'; position: Position }
  | { art: 'unscharf'; position: Koordinate }
  | { art: 'ping'; position: Koordinate; alterSekunden: number; istKoeder?: boolean };

export type FaehigkeitId =
  | 'tarnkappe'
  | 'koeder'
  | 'radar'
  | 'stoersender'
  | 'schild'
  | 'sonderping'
  | 'peilung'
  | 'sonar'
  | 'blackout'
  | 'zonenstoss';

export type TicketTyp = 'bus' | 'tram' | 'ubahn' | 'sbahn' | 'zug' | 'faehre' | 'black' | 'doppelzug';

export interface MrXTicket {
  id: string;
  typ: TicketTyp;
  linie?: string;
  haltestelle?: string;
  zeit: number;
  aufgedeckt: boolean;
}

export interface Spieler {
  id: string;
  spitzname: string;
  icon: string;
  farbe: string;
  rolle: Rolle;
  bereit: boolean;
  online: boolean;
  energie: number;
  position?: Position;
  letzterPingPosition?: Koordinate;
  letzterPingZeit?: number;
  letztesUpdateZeit?: number;
  ausserhalbZone: boolean;
  ausserhalbZoneSeit?: number;
  funklochStrafeBis?: number;
  gefangen: boolean;
  gefangenUm?: number;
  gefangenVon?: string;
  faehigkeitenStatus: {
    tarnkappeAktiv: boolean;
    koederPunkt?: Koordinate;
    radarBis?: number;
    stoersenderBis?: number;
    schildBis?: number;
    blackoutBis?: number;
    peilungBis?: number;
    abklingzeiten: Record<string, number>;
  };
  mrxStatus?: {
    tickets: MrXTicket[];
    blackTicketsVerbleibend: number;
    doppelzugVerfuegbar: boolean;
    doppelzugAktiv: boolean;
    letzteAufdeckungKoordinate?: Koordinate;
    letzteAufdeckungZeit?: number;
    letztesAufdeckTicketNr: number;
  };
}

export interface ZoneStufe {
  stufe: number;
  mittelpunkt: Koordinate;
  radiusMeter: number;
  startSekunden: number;
  schrumpfDauerSekunden: number;
}

export interface SpielEinstellungen {
  dauerMinuten: number;
  versteckZeitMinuten: number;
  pingIntervallMinuten: number;
  zonenRadiusStartMeter: number;
  zonenStufen: number;
  radiusFaktor: number;
  fangRadiusMeter: number;
  autoBestaetigungSekunden: number;
  kulanzZeitZoneSekunden: number;
  naeheWarnungAktiv: boolean;
  naeheWarnungRadiusMeter: number;
  funklochStrafeAktiv: boolean;
  faehigkeitenAktiv: boolean;
  faehigkeitenSchalter: Record<string, boolean>;
  // Mr. X
  mrxAufdeckRegel: 'tickets' | 'entfernung' | 'zeit';
  mrxAufdeckTicketIntervall: number;
  mrxAufdeckDistanzMeter: number;
  mrxAufdeckZeitMinuten: number;
  mrxSiehtDetektive: boolean;
}

export interface LootPunkt {
  id: string;
  koordinate: Koordinate;
  energieWert: number;
  gespawntUm: number;
}

export interface SpielEreignis {
  id: string;
  typ: 'ping' | 'zone' | 'gefangen' | 'faehigkeit' | 'ticket' | 'aufdeckung' | 'chat' | 'phase' | 'warnung';
  zeit: number;
  daten: Record<string, unknown>;
}

export interface SpielZustand {
  code: string;
  hostId: string;
  phase: SpielPhase;
  modus: SpielModus;
  einstellungen: SpielEinstellungen;
  spieler: Record<string, Spieler>;
  aktuelleZone: {
    mittelpunkt: Koordinate;
    radiusMeter: number;
    stufe: number;
    naechsteZone?: {
      mittelpunkt: Koordinate;
      radiusMeter: number;
      startZeit: number;
    };
  };
  lootPunkte: LootPunkt[];
  phasenStartZeit: number;
  naechsterPingZeit: number;
  jetzt: number;
  sieger?: 'seeker' | 'hider' | 'zombie' | 'mensch' | 'mrx' | 'detektiv';
}

export interface PushAbo {
  spielerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
