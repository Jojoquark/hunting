import { Position, SpielModus, Spieler, SpielZustand } from './types';
import { haversineDistanz } from './geo';

export const REPLAY_DEAKTIVIERT_TEXT = 'Replays sind deaktiviert, bis eine Einwilligungs- und Replay-Funktion verfügbar ist.';

export function erstelleReplayDeaktiviertAntwort(): Response {
  return new Response(REPLAY_DEAKTIVIERT_TEXT, {
    status: 501,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

export function anonymisiereAbgelaufeneSpielDaten(zustand: SpielZustand, jetzt: number, aufbewahrungMs: number): boolean {
  if (zustand.phase !== 'ende' || !zustand.beendetUm || zustand.datenBereinigt ||
    jetzt < zustand.beendetUm + aufbewahrungMs) return false;
  zustand.hostId = 'abgelaufen';
  zustand.spieler = {};
  zustand.aktuelleZone = {
    mittelpunkt: { lat: 0, lng: 0 },
    radiusMeter: 0,
    stufe: 0
  };
  zustand.lootPunkte = [];
  zustand.phasenStartZeit = 0;
  zustand.naechsterPingZeit = 0;
  zustand.letzterLootSpawn = undefined;
  zustand.sieger = undefined;
  zustand.jetzt = jetzt;
  zustand.datenBereinigt = true;
  return true;
}

export function istSpielerId(wert: string): boolean {
  return /^[a-f0-9]{32}$/.test(wert);
}

export function istZugangstoken(wert: string): boolean {
  return /^[a-f0-9]{64}$/.test(wert);
}

export async function hasheZugangstoken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function vergleicheKonstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function istQrGeheimnisKonfiguriert(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.length >= 32;
}

export function istGueltigePosition(wert: unknown, jetzt: number): wert is Position {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false;
  const position = wert as Partial<Position>;
  return Number.isFinite(position.lat) && Number.isFinite(position.lng) &&
    (position.lat as number) >= -90 && (position.lat as number) <= 90 &&
    (position.lng as number) >= -180 && (position.lng as number) <= 180 &&
    Number.isFinite(position.genauigkeit) && (position.genauigkeit as number) >= 0 && (position.genauigkeit as number) <= 5000 &&
    Number.isFinite(position.zeit) && (position.zeit as number) >= jetzt - 30000 && (position.zeit as number) <= jetzt + 5000 &&
    (position.tempo === undefined || position.tempo === null ||
      (Number.isFinite(position.tempo) && (position.tempo as number) >= 0 && (position.tempo as number) <= 100));
}

export function liegtImFangRadius(faenger: Spieler, ziel: Spieler, fangRadiusMeter: number): boolean {
  if (!faenger.position || !ziel.position || !Number.isFinite(fangRadiusMeter)) return false;
  const distanz = haversineDistanz(faenger.position, ziel.position);
  const erlaubteDistanz = fangRadiusMeter + Math.min(ziel.position.genauigkeit, 20);
  return Number.isFinite(distanz) && Number.isFinite(erlaubteDistanz) && distanz <= erlaubteDistanz;
}

export function rolleFuerSpieler(modus: SpielModus, istHost: boolean): Spieler['rolle'] {
  if (modus === 'zombie') return istHost ? 'zombie' : 'mensch';
  if (modus === 'mrx') return istHost ? 'mrx' : 'detektiv';
  return istHost ? 'seeker' : 'hider';
}
