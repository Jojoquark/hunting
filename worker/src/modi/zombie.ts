import { Spieler, SpielZustand } from '../types';

export function verwandleInZombie(ziel: Spieler, faenger: Spieler | undefined, zustand: SpielZustand): void {
  ziel.rolle = 'zombie';
  ziel.gefangen = false;
  ziel.gefangenUm = zustand.jetzt;
  ziel.gefangenVon = faenger?.id || 'zone';
}

export function pruefeZombieSieg(zustand: SpielZustand): 'zombie' | 'mensch' | null {
  const menschen = Object.values(zustand.spieler).filter((s) => s.rolle === 'mensch');
  if (menschen.length === 0) {
    return 'zombie';
  }

  const restzeit = (zustand.einstellungen.dauerMinuten * 60) - Math.floor((zustand.jetzt - zustand.phasenStartZeit) / 1000);
  if (restzeit <= 0 && menschen.length > 0) {
    return 'mensch';
  }

  return null;
}
