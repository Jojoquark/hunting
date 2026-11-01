import { FaehigkeitId, SpielEinstellungen } from './typen.js';

export const WERTEBEREICHE = {
  spielDauerMinuten: { min: 10, max: 240, standard: 60 },
  versteckZeitMinuten: { min: 1, max: 30, standard: 10 },
  pingIntervallMinuten: { min: 1, max: 30, standard: 5 },
  zonenRadiusMeter: { min: 150, max: 10000, standard: 1000 },
  zonenStufen: { min: 0, max: 8, standard: 4 },
  zonenFaktor: { min: 0.4, max: 0.9, standard: 0.65 },
  fangRadiusMeter: { min: 10, max: 60, standard: 25 },
  autoBestaetigungSekunden: { min: 5, max: 60, standard: 15 },
  kulanzZoneSekunden: { min: 0, max: 300, standard: 60 },
  warnungSeekerNaeheMeter: { min: 50, max: 300, standard: 100 }
} as const;

export const STANDARD_ERLAUBTE_FAEHIGKEITEN: Record<FaehigkeitId, boolean> = {
  tarnkappe: true,
  koeder: true,
  radar: true,
  stoersender: true,
  schild: true,
  sonderping: true,
  peilung: true,
  sonar: true,
  blackout: true,
  zonenstoss: true
};

export const standardPreset: SpielEinstellungen = {
  spielDauerMinuten: 60,
  versteckZeitMinuten: 10,
  pingIntervallMinuten: 5,
  zonenRadiusMeter: 1000,
  zonenStufen: 4,
  zonenFaktor: 0.65,
  fangRadiusMeter: 25,
  autoBestaetigungSekunden: 15,
  kulanzZoneSekunden: 60,
  warnungSeekerNaeheAktiv: true,
  warnungSeekerNaeheMeter: 100,
  funklochStrafeAktiv: true,
  faehigkeitenAktiv: false,
  erlaubteFaehigkeiten: { ...STANDARD_ERLAUBTE_FAEHIGKEITEN },
  mrxAufdeckRegel: 'tickets',
  mrxAufdeckIntervallTickets: 3,
  mrxAufdeckDistanzMeter: 2000,
  mrxAufdeckIntervallMinuten: 15,
  mrxSichtAufDetektive: true,
  startZombiesAnzahl: 1,
  startMrXAnzahl: 1
};

export const schnellPreset: SpielEinstellungen = {
  ...standardPreset,
  spielDauerMinuten: 20,
  versteckZeitMinuten: 3,
  pingIntervallMinuten: 2,
  zonenRadiusMeter: 400,
  zonenStufen: 3,
  zonenFaktor: 0.6
};

export const stadtjagdPreset: SpielEinstellungen = {
  ...standardPreset,
  spielDauerMinuten: 120,
  versteckZeitMinuten: 15,
  pingIntervallMinuten: 10,
  zonenRadiusMeter: 4000,
  zonenStufen: 5,
  zonenFaktor: 0.7,
  fangRadiusMeter: 30
};

export const mrxStandardPreset: SpielEinstellungen = {
  ...standardPreset,
  spielDauerMinuten: 120,
  versteckZeitMinuten: 10,
  zonenRadiusMeter: 5000,
  zonenStufen: 0,
  mrxAufdeckRegel: 'tickets',
  mrxAufdeckIntervallTickets: 3,
  mrxSichtAufDetektive: true
};

export const zombieStandardPreset: SpielEinstellungen = {
  ...standardPreset,
  spielDauerMinuten: 45,
  versteckZeitMinuten: 5,
  pingIntervallMinuten: 3,
  zonenRadiusMeter: 800,
  zonenStufen: 3,
  zonenFaktor: 0.65,
  startZombiesAnzahl: 1
};

export const PRESETS = {
  standard: standardPreset,
  schnell: schnellPreset,
  stadtjagd: stadtjagdPreset,
  mrx: mrxStandardPreset,
  zombie: zombieStandardPreset
} as const;

export function validiereEinstellungen(
  einstellungen: SpielEinstellungen
): { gueltig: boolean; fehler: string[] } {
  const fehler: string[] = [];

  function pruefe(
    feld: keyof typeof WERTEBEREICHE,
    wert: number,
    name: string
  ) {
    const { min, max } = WERTEBEREICHE[feld];
    if (wert < min || wert > max) {
      fehler.push(`${name} muss zwischen ${min} und ${max} liegen (ist: ${wert}).`);
    }
  }

  pruefe('spielDauerMinuten', einstellungen.spielDauerMinuten, 'Spieldauer');
  pruefe('versteckZeitMinuten', einstellungen.versteckZeitMinuten, 'Versteckzeit');
  pruefe('pingIntervallMinuten', einstellungen.pingIntervallMinuten, 'Ping-Intervall');
  pruefe('zonenRadiusMeter', einstellungen.zonenRadiusMeter, 'Zonenradius');
  pruefe('zonenStufen', einstellungen.zonenStufen, 'Zonenstufen');
  pruefe('zonenFaktor', einstellungen.zonenFaktor, 'Zonenfaktor');
  pruefe('fangRadiusMeter', einstellungen.fangRadiusMeter, 'Fangradius');
  pruefe('autoBestaetigungSekunden', einstellungen.autoBestaetigungSekunden, 'Auto-Bestätigung');
  pruefe('kulanzZoneSekunden', einstellungen.kulanzZoneSekunden, 'Kulanzzeit außerhalb der Zone');

  if (einstellungen.versteckZeitMinuten >= einstellungen.spielDauerMinuten) {
    fehler.push('Versteckzeit muss kürzer als die gesamte Spieldauer sein.');
  }

  return {
    gueltig: fehler.length === 0,
    fehler
  };
}
