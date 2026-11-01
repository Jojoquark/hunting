import { FaehigkeitId, FaehigkeitenSeite, Rolle } from './typen.js';

export interface FaehigkeitsDefinition {
  id: FaehigkeitId;
  name: string;
  seite: FaehigkeitenSeite;
  kosten: number;
  abklingzeitSekunden: number;
  dauerSekunden?: number;
  reichweiteMeter?: number;
  einmaligProSpiel?: boolean;
  einmaligProStufe?: boolean;
  beschreibung: string;
}

export const FAEHIGKEITEN_KATALOG: Record<FaehigkeitId, FaehigkeitsDefinition> = {
  tarnkappe: {
    id: 'tarnkappe',
    name: 'Tarnkappe',
    seite: 'hider',
    kosten: 60,
    abklingzeitSekunden: 600,
    beschreibung: 'Der nächste Ping bzw. die nächste Aufdeckung zeigt dich nicht.'
  },
  koeder: {
    id: 'koeder',
    name: 'Köder',
    seite: 'hider',
    kosten: 50,
    abklingzeitSekunden: 600,
    reichweiteMeter: 300,
    beschreibung: 'Der nächste Ping zeigt einen selbst gewählten Punkt im Umkreis von <= 300 m.'
  },
  radar: {
    id: 'radar',
    name: 'Radar',
    seite: 'hider',
    kosten: 40,
    abklingzeitSekunden: 300,
    dauerSekunden: 15,
    beschreibung: '15 Sekunden lang alle Seeker live sehen.'
  },
  stoersender: {
    id: 'stoersender',
    name: 'Störsender',
    seite: 'hider',
    kosten: 50,
    abklingzeitSekunden: 480,
    dauerSekunden: 60,
    reichweiteMeter: 150,
    beschreibung: 'Seeker im Umkreis von 150 m können 60 Sekunden lang nicht fangen.'
  },
  schild: {
    id: 'schild',
    name: 'Schild',
    seite: 'hider',
    kosten: 70,
    abklingzeitSekunden: 0,
    dauerSekunden: 30,
    einmaligProSpiel: true,
    beschreibung: '30 Sekunden lang nicht fangbar (1x pro Spiel).'
  },
  sonderping: {
    id: 'sonderping',
    name: 'Sonderping',
    seite: 'seeker',
    kosten: 60,
    abklingzeitSekunden: 480,
    beschreibung: 'Sofortiger Ping eines zufälligen Hiders.'
  },
  peilung: {
    id: 'peilung',
    name: 'Peilung',
    seite: 'seeker',
    kosten: 40,
    abklingzeitSekunden: 300,
    dauerSekunden: 20,
    beschreibung: 'Pfeil zum nächsten Hider für 20 Sekunden ohne Entfernungsangabe.'
  },
  sonar: {
    id: 'sonar',
    name: 'Sonar',
    seite: 'seeker',
    kosten: 30,
    abklingzeitSekunden: 180,
    reichweiteMeter: 250,
    beschreibung: 'Anzahl der Hider im Umkreis von 250 m ermitteln.'
  },
  blackout: {
    id: 'blackout',
    name: 'Blackout',
    seite: 'seeker',
    kosten: 70,
    abklingzeitSekunden: 720,
    dauerSekunden: 120,
    beschreibung: 'Hider können 2 Minuten lang keine Fähigkeiten nutzen.'
  },
  zonenstoss: {
    id: 'zonenstoss',
    name: 'Zonenstoß',
    seite: 'seeker',
    kosten: 60,
    abklingzeitSekunden: 0,
    einmaligProStufe: true,
    beschreibung: 'Die nächste Verkleinerung kommt 2 Minuten früher (1x pro Zonenstufe).'
  }
};

export function ermittleFaehigkeitenSeite(rolle: Rolle): FaehigkeitenSeite | null {
  switch (rolle) {
    case 'hider':
    case 'mensch':
    case 'mrx':
      return 'hider';
    case 'seeker':
    case 'zombie':
    case 'detektiv':
      return 'seeker';
    case 'zuschauer':
    default:
      return null;
  }
}

export function passtRolleZuFaehigkeit(rolle: Rolle, faehigkeitId: FaehigkeitId): boolean {
  const seite = ermittleFaehigkeitenSeite(rolle);
  if (!seite) return false;
  return FAEHIGKEITEN_KATALOG[faehigkeitId].seite === seite;
}

export function hatGenugEnergie(aktuelleEnergie: number, faehigkeitId: FaehigkeitId): boolean {
  return aktuelleEnergie >= FAEHIGKEITEN_KATALOG[faehigkeitId].kosten;
}

export function istAbklingzeitVorbei(
  jetztMs: number,
  abklingzeitEndeMs: number | undefined
): boolean {
  if (!abklingzeitEndeMs) return true;
  return jetztMs >= abklingzeitEndeMs;
}
