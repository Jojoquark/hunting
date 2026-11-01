import { describe, it, expect } from 'vitest';

export type Rolle = 'seeker' | 'hider' | 'zombie' | 'mrx' | 'detektiv' | 'zuschauer';

export interface Position {
  lat: number;
  lng: number;
  genauigkeit: number;
  zeit: number;
  tempo?: number;
}

export interface Spieler {
  id: string;
  rolle: Rolle;
  position?: Position;
  inZone: boolean;
  letzterPing?: Position;
  unsichtbarBis?: number;
  warnungSeekerInNaehe?: boolean;
}

export interface SpielZustand {
  phase: 'lobby' | 'verstecken' | 'jagd' | 'ende';
  spieler: Record<string, Spieler>;
  aktiverPingZeitpunkt?: number;
}

export type Sichtbarkeit = 'unsichtbar' | 'ping' | 'unscharf' | 'live';

export function ermittleSichtbarkeit(
  betrachter: Spieler,
  ziel: Spieler,
  zustand: SpielZustand,
  aktuelleZeit: number
): Sichtbarkeit {
  if (betrachter.id === ziel.id) return 'live';
  if (betrachter.rolle === 'zuschauer') return 'live';

  if (betrachter.rolle === 'seeker' && ziel.rolle === 'seeker') {
    return 'live';
  }

  if (betrachter.rolle === 'seeker' && ziel.rolle === 'hider') {
    if (zustand.phase !== 'jagd') return 'unsichtbar';
    if (!ziel.inZone) return 'live';
    if (ziel.unsichtbarBis && ziel.unsichtbarBis > aktuelleZeit) return 'unsichtbar';
    if (zustand.aktiverPingZeitpunkt && aktuelleZeit - zustand.aktiverPingZeitpunkt <= 10000) {
      return 'ping';
    }
    return 'unsichtbar';
  }

  if (ziel.rolle === 'zombie' && betrachter.rolle === 'hider') {
    return 'unscharf';
  }

  return 'unsichtbar';
}

export function filtereZustandFuerSpieler(
  empfaengerId: string,
  zustand: SpielZustand,
  aktuelleZeit: number
): { spieler: Record<string, Partial<Spieler>>; fangbareZiele: string[]; seekerInNaehe?: boolean } {
  const betrachter = zustand.spieler[empfaengerId];
  if (!betrachter) throw new Error('Unbekannter Betrachter');

  const gefilterteSpieler: Record<string, Partial<Spieler>> = {};
  const fangbareZiele: string[] = [];

  for (const [id, ziel] of Object.entries(zustand.spieler)) {
    const sicht = ermittleSichtbarkeit(betrachter, ziel, zustand, aktuelleZeit);

    if (sicht === 'unsichtbar') {
      gefilterteSpieler[id] = {
        id: ziel.id,
        rolle: ziel.rolle,
        inZone: ziel.inZone,
      };
    } else if (sicht === 'ping') {
      gefilterteSpieler[id] = {
        id: ziel.id,
        rolle: ziel.rolle,
        position: ziel.letzterPing ?? ziel.position,
        inZone: ziel.inZone,
      };
    } else if (sicht === 'unscharf') {
      if (ziel.position) {
        const roundedLat = Math.round(ziel.position.lat * 2000) / 2000;
        const roundedLng = Math.round(ziel.position.lng * 2000) / 2000;
        gefilterteSpieler[id] = {
          id: ziel.id,
          rolle: ziel.rolle,
          position: {
            lat: roundedLat,
            lng: roundedLng,
            genauigkeit: 50,
            zeit: ziel.position.zeit,
          },
        };
      }
    } else if (sicht === 'live') {
      gefilterteSpieler[id] = {
        id: ziel.id,
        rolle: ziel.rolle,
        position: ziel.position,
        inZone: ziel.inZone,
      };
    }

    if (betrachter.rolle === 'seeker' && ziel.rolle === 'hider' && ziel.position && betrachter.position) {
      const dist = Math.hypot(betrachter.position.lat - ziel.position.lat, betrachter.position.lng - ziel.position.lng);
      if (dist < 0.0003) {
        fangbareZiele.push(ziel.id);
      }
    }
  }

  let seekerInNaehe: boolean | undefined = undefined;
  if (betrachter.rolle === 'hider') {
    seekerInNaehe = Object.values(zustand.spieler).some((s) => {
      if (s.rolle !== 'seeker' || !s.position || !betrachter.position) return false;
      const d = Math.hypot(s.position.lat - betrachter.position.lat, s.position.lng - betrachter.position.lng);
      return d < 0.001;
    });
  }

  return { spieler: gefilterteSpieler, fangbareZiele, seekerInNaehe };
}

describe('Security Audit: Zero-Knowledge Sichtbarkeits- und Koordinatenleakage', () => {
  const jetzt = 1730480000000;

  it('Verhindert das Leaken von Hider-Koordinaten an Seeker waehrend regulaerer Jagdphase', () => {
    const zustand: SpielZustand = {
      phase: 'jagd',
      spieler: {
        seeker1: { id: 'seeker1', rolle: 'seeker', inZone: true, position: { lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: jetzt } },
        hider1: { id: 'hider1', rolle: 'hider', inZone: true, position: { lat: 52.5205, lng: 13.4055, genauigkeit: 5, zeit: jetzt } }
      }
    };

    const payload = filtereZustandFuerSpieler('seeker1', zustand, jetzt);

    expect(payload.spieler['hider1'].position).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('52.5205');
    expect(JSON.stringify(payload)).not.toContain('13.4055');
  });

  it('Fangen-Button signalisiert fangbar, enthuellt aber niemals die Ziel-Koordinaten', () => {
    const zustand: SpielZustand = {
      phase: 'jagd',
      spieler: {
        seeker1: { id: 'seeker1', rolle: 'seeker', inZone: true, position: { lat: 52.52000, lng: 13.40500, genauigkeit: 5, zeit: jetzt } },
        hider1: { id: 'hider1', rolle: 'hider', inZone: true, position: { lat: 52.52005, lng: 13.40505, genauigkeit: 5, zeit: jetzt } }
      }
    };

    const payload = filtereZustandFuerSpieler('seeker1', zustand, jetzt);

    expect(payload.fangbareZiele).toContain('hider1');
    expect(payload.spieler['hider1'].position).toBeUndefined();
  });

  it('Seeker-in-der-Naehe-Warnung schickt nur ein Flag, keine gegnerischen Koordinaten', () => {
    const zustand: SpielZustand = {
      phase: 'jagd',
      spieler: {
        seeker1: { id: 'seeker1', rolle: 'seeker', inZone: true, position: { lat: 52.5201, lng: 13.4051, genauigkeit: 5, zeit: jetzt } },
        hider1: { id: 'hider1', rolle: 'hider', inZone: true, position: { lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: jetzt } }
      }
    };

    const payload = filtereZustandFuerSpieler('hider1', zustand, jetzt);

    expect(payload.seekerInNaehe).toBe(true);
    expect(payload.spieler['seeker1'].position).toBeUndefined();
  });

  it('Im Zombie-Modus werden Koordinaten fuer Menschen auf 50m unscharf quantisiert', () => {
    const zustand: SpielZustand = {
      phase: 'jagd',
      spieler: {
        mensch1: { id: 'mensch1', rolle: 'hider', inZone: true, position: { lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: jetzt } },
        zombie1: { id: 'zombie1', rolle: 'zombie', inZone: true, position: { lat: 52.524817, lng: 13.409382, genauigkeit: 5, zeit: jetzt } }
      }
    };

    const payload = filtereZustandFuerSpieler('mensch1', zustand, jetzt);
    const zombiePos = payload.spieler['zombie1'].position;

    expect(zombiePos).toBeDefined();
    expect(zombiePos?.lat).not.toBe(52.524817);
    expect(zombiePos?.lng).not.toBe(13.409382);
    expect(zombiePos?.genauigkeit).toBe(50);
  });
});
