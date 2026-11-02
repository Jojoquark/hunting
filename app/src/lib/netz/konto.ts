import { ermittleBasisHttpUrl } from './config';

export interface KontoSitzung {
  name: string;
  token: string;
}

const SPEICHER_SCHLUESSEL = 'hunting_konto';

export function leseKonto(): KontoSitzung | null {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return null;
    const sitzung = JSON.parse(roh) as KontoSitzung;
    return sitzung.name && sitzung.token ? sitzung : null;
  } catch {
    return null;
  }
}

function speichereKonto(sitzung: KontoSitzung | null) {
  try {
    if (sitzung) localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(sitzung));
    else localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } catch {
    // Ohne Speicher gilt die Anmeldung nur bis zum Neuladen.
  }
}

async function sende(aktion: string, daten: Record<string, string>): Promise<Response> {
  return fetch(`${ermittleBasisHttpUrl()}/konto/${aktion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten)
  });
}

async function fehlertext(antwort: Response): Promise<string> {
  const text = (await antwort.text().catch(() => '')).trim();
  if (text) return text;
  return antwort.status === 429 ? 'Zu viele Versuche. Bitte warte kurz.' : 'Der Server ist gerade nicht erreichbar.';
}

/** Registriert oder meldet an; wirft bei Fehlern eine lesbare Meldung. */
export async function kontoZugang(art: 'registrieren' | 'anmelden', name: string, passwort: string): Promise<KontoSitzung> {
  let antwort: Response;
  try {
    antwort = await sende(art, { name, passwort });
  } catch {
    throw new Error('Keine Verbindung zum Server. Prüfe dein Internet.');
  }
  if (!antwort.ok) throw new Error(await fehlertext(antwort));
  const sitzung = await antwort.json() as KontoSitzung;
  speichereKonto(sitzung);
  return sitzung;
}

/** Prüft die gespeicherte Sitzung. Bei Netzfehlern bleibt sie erhalten, nur abgelehnte werden gelöscht. */
export async function pruefeKonto(): Promise<KontoSitzung | null> {
  const sitzung = leseKonto();
  if (!sitzung) return null;
  try {
    const antwort = await sende('pruefen', { name: sitzung.name, token: sitzung.token });
    if (antwort.status === 401 || antwort.status === 400) {
      speichereKonto(null);
      return null;
    }
  } catch {
    // Offline: Sitzung lokal weiterverwenden.
  }
  return sitzung;
}

export interface KontoStatistik {
  spiele: number;
  siege: number;
  siegeFaenger: number;
  siegeGejagt: number;
  distanzMeter: number;
  faenge: number;
  laengstesUeberlebenSekunden: number;
  letzte: Array<{
    spielCode: string;
    modus: string;
    team: string;
    gewonnen: boolean;
    distanzMeter: number;
    faenge: number;
    zeit: number;
  }>;
}

export async function ladeStatistik(): Promise<KontoStatistik | null> {
  const sitzung = leseKonto();
  if (!sitzung) return null;
  try {
    const antwort = await sende('statistik', { name: sitzung.name, token: sitzung.token });
    return antwort.ok ? await antwort.json() as KontoStatistik : null;
  } catch {
    return null;
  }
}

export async function kontoAbmelden(): Promise<void> {
  const sitzung = leseKonto();
  speichereKonto(null);
  if (!sitzung) return;
  await sende('abmelden', { name: sitzung.name, token: sitzung.token }).catch(() => undefined);
}
