export type Rolle =
  | 'seeker'
  | 'hider'
  | 'zombie'
  | 'mensch'
  | 'mrx'
  | 'detektiv'
  | 'zuschauer';

export type SpielModus = 'klassisch' | 'zombie' | 'mrx';

export type SpielPhase = 'lobby' | 'versteckphase' | 'jagd' | 'ende';

export type Verkehrsmittel =
  | 'bus'
  | 'tram'
  | 'ubahn'
  | 'sbahn'
  | 'zug'
  | 'faehre'
  | 'fuss';

export type SpezialTicket = 'black' | 'doppelzug';

export interface Ticket {
  id: string;
  spielerId: string;
  zeit: number;
  verkehrsmittel: Verkehrsmittel;
  linie?: string;
  haltestelle?: string;
  spezial?: SpezialTicket;
  aufgedeckt: boolean;
}

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

export type FaehigkeitenSeite = 'hider' | 'seeker';

export interface AktiveFaehigkeit {
  faehigkeitId: FaehigkeitId;
  gestartetUm: number;
  endetUm: number;
  parameter?: {
    koederOrt?: { lat: number; lng: number };
    [key: string]: unknown;
  };
}

export type ChatKanal = 'alle' | 'team' | 'zuschauer';

export interface ChatNachricht {
  id: string;
  senderId: string;
  senderName: string;
  kanal: ChatKanal;
  text?: string;
  schnellNachrichtId?: string;
  zeit: number;
}

export interface Ort {
  lat: number;
  lng: number;
  genauigkeit: number;
  zeit: number;
  tempo?: number | null;
  heading?: number | null;
}

export type SichtbarkeitsTyp = 'unsichtbar' | 'ping' | 'unscharf' | 'live';

export interface SichtbarePosition {
  spielerId: string;
  name: string;
  farbe: string;
  icon: string;
  rolle: Rolle;
  lat: number;
  lng: number;
  genauigkeit: number;
  typ: SichtbarkeitsTyp;
  zeitpunkt: number;
  istVeraltet?: boolean;
}

export interface Spieler {
  id: string;
  name: string;
  icon: string;
  farbe: string;
  rolle: Rolle;
  bereit: boolean;
  istHost: boolean;
  verbunden: boolean;
  energie: number;
  gefangen: boolean;
  gefangenUm?: number;
  gefangenVon?: string;
  letzterOrt?: Ort;
  letzteMeldung?: number;
  ausserhalbZoneSeit?: number | null;
  aktiveFaehigkeiten: AktiveFaehigkeit[];
  abklingzeiten: Record<string, number>;
  tickets?: Ticket[];
  verbleibendeSpezialTickets?: {
    blackTicket: number;
    doppelzug: number;
  };
}

export type MrXAufdeckRegel = 'tickets' | 'entfernung' | 'zeit';

export interface SpielEinstellungen {
  spielDauerMinuten: number;
  versteckZeitMinuten: number;
  pingIntervallMinuten: number;
  zonenRadiusMeter: number;
  zonenStufen: number;
  zonenFaktor: number;
  fangRadiusMeter: number;
  autoBestaetigungSekunden: number;
  kulanzZoneSekunden: number;
  warnungSeekerNaeheAktiv: boolean;
  warnungSeekerNaeheMeter: number;
  funklochStrafeAktiv: boolean;
  faehigkeitenAktiv: boolean;
  erlaubteFaehigkeiten: Record<FaehigkeitId, boolean>;
  faehigkeitenKosten?: Partial<Record<FaehigkeitId, number>>;
  faehigkeitenAbklingzeit?: Partial<Record<FaehigkeitId, number>>;
  mrxAufdeckRegel: MrXAufdeckRegel;
  mrxAufdeckIntervallTickets: number;
  mrxAufdeckDistanzMeter: number;
  mrxAufdeckIntervallMinuten: number;
  mrxSichtAufDetektive: boolean;
  startZombiesAnzahl: number;
  startMrXAnzahl: number;
}

export interface LootPunkt {
  id: string;
  lat: number;
  lng: number;
  gespawntUm: number;
  aktiv: boolean;
}

export type SpielEreignisTyp =
  | 'phase'
  | 'ping'
  | 'zone_warnung'
  | 'zone_schrumpf'
  | 'zone_fertig'
  | 'fang_anfrage'
  | 'gefangen'
  | 'fang_abgelehnt'
  | 'faehigkeit'
  | 'ticket'
  | 'aufdeckung'
  | 'loot_gesammelt'
  | 'loot_gespawnt'
  | 'chat'
  | 'warnung_tempo'
  | 'warnung_zone';

export interface SpielEreignis {
  id: string;
  zeit: number;
  typ: SpielEreignisTyp;
  daten: Record<string, unknown>;
}

export interface ZoneModell {
  mittelpunkt: { lat: number; lng: number };
  radiusMeter: number;
}

export interface ZonenStufeModell extends ZoneModell {
  stufe: number;
  warnungZeitpunkt: number;
  schrumpfStartZeitpunkt: number;
  schrumpfEndeZeitpunkt: number;
}

export interface SpielZustandSnapshot {
  code: string;
  phase: SpielPhase;
  modus: SpielModus;
  einstellungen: SpielEinstellungen;
  spieler: Spieler[];
  zone: ZoneModell;
  zonenStufen: ZonenStufeModell[];
  restSekundenPhase: number;
  serverZeit: number;
  aktiverLoot: LootPunkt[];
}
