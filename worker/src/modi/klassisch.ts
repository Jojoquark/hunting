import { Spieler, SpielZustand } from '../types';
import { haversineDistanz } from '../geo';

export function pruefeKlassischNaeheWarnung(
  hider: Spieler,
  zustand: SpielZustand
): boolean {
  if (!zustand.einstellungen.naeheWarnungAktiv || !hider.position || hider.gefangen) {
    return false;
  }

  const radius = zustand.einstellungen.naeheWarnungRadiusMeter;
  for (const sp of Object.values(zustand.spieler)) {
    if (sp.rolle === 'seeker' && sp.position && !sp.gefangen) {
      if (haversineDistanz(hider.position, sp.position) <= radius) {
        return true;
      }
    }
  }
  return false;
}

export function pruefeKlassischSieg(zustand: SpielZustand): 'seeker' | 'hider' | null {
  const alleHider = Object.values(zustand.spieler).filter((s) => s.rolle === 'hider' || (s.rolle === 'zuschauer' && s.gefangen));
  if (alleHider.length === 0) return null;

  const freieHider = alleHider.filter((s) => !s.gefangen);
  if (freieHider.length === 0) {
    return 'seeker';
  }

  // Wenn Spielzeit abgelaufen ist und mindestens ein Hider frei ist
  const restzeit = (zustand.einstellungen.dauerMinuten * 60) - Math.floor((zustand.jetzt - zustand.phasenStartZeit) / 1000);
  if (restzeit <= 0 && freieHider.length > 0) {
    return 'hider';
  }

  return null;
}
