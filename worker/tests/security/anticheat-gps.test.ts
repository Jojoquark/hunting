import { describe, it, expect } from 'vitest';

export interface GpsUpdate {
  lat: number;
  lng: number;
  genauigkeit: number;
  zeit: number;
}

export interface AntiCheatErgebnis {
  akzeptiert: boolean;
  verdaechtigeSpruenge: number;
  hostWarnung: boolean;
  grund?: string;
}

export function haversineMeter(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function pruefeGpsPlausibilitaet(
  letztePosition: GpsUpdate | undefined,
  neuesUpdate: GpsUpdate,
  bisherigeSpruenge: number,
  serverZeit: number
): AntiCheatErgebnis {
  if (neuesUpdate.zeit > serverZeit + 5000) {
    return { akzeptiert: false, verdaechtigeSpruenge: bisherigeSpruenge + 1, hostWarnung: bisherigeSpruenge + 1 >= 3, grund: 'ZEITSTEMPEL_IN_ZUKUNFT' };
  }

  if (neuesUpdate.zeit < serverZeit - 60000) {
    return { akzeptiert: false, verdaechtigeSpruenge: bisherigeSpruenge, hostWarnung: bisherigeSpruenge >= 3, grund: 'ZEITSTEMPEL_VERALTET' };
  }

  if (!letztePosition) {
    return { akzeptiert: true, verdaechtigeSpruenge: bisherigeSpruenge, hostWarnung: bisherigeSpruenge >= 3 };
  }

  const dtSekunden = (neuesUpdate.zeit - letztePosition.zeit) / 1000;
  if (dtSekunden <= 0) {
    return { akzeptiert: false, verdaechtigeSpruenge: bisherigeSpruenge + 1, hostWarnung: bisherigeSpruenge + 1 >= 3, grund: 'ZEITSTEMPEL_REPLAY_ODER_RUECKWAERTS' };
  }

  const distanzMeter = haversineMeter(letztePosition.lat, letztePosition.lng, neuesUpdate.lat, neuesUpdate.lng);
  const geschwindigkeit = distanzMeter / dtSekunden;

  if (geschwindigkeit > 50) {
    const neueSpruenge = bisherigeSpruenge + 1;
    return {
      akzeptiert: false,
      verdaechtigeSpruenge: neueSpruenge,
      hostWarnung: neueSpruenge >= 3,
      grund: `TELEPORT_ERKANNT_${Math.round(geschwindigkeit)}ms`,
    };
  }

  return { akzeptiert: true, verdaechtigeSpruenge: bisherigeSpruenge, hostWarnung: bisherigeSpruenge >= 3 };
}

describe('Anti-Cheat Audit: GPS-Teleportation & Spoofing Defense', () => {
  const t0 = 1730480000000;
  const startPos: GpsUpdate = { lat: 52.52000, lng: 13.40500, genauigkeit: 5, zeit: t0 };

  it('Akzeptiert realistische Lauf- und Sprintgeschwindigkeiten', () => {
    const sprintPos: GpsUpdate = { lat: 52.52020, lng: 13.40500, genauigkeit: 5, zeit: t0 + 4000 };
    const res = pruefeGpsPlausibilitaet(startPos, sprintPos, 0, t0 + 4000);
    expect(res.akzeptiert).toBe(true);
    expect(res.verdaechtigeSpruenge).toBe(0);
  });

  it('Blockiert Teleportationssprung (> 50 m/s) und inkrementiert Zaehler', () => {
    const teleportPos: GpsUpdate = { lat: 52.52800, lng: 13.40500, genauigkeit: 5, zeit: t0 + 2000 };
    const res = pruefeGpsPlausibilitaet(startPos, teleportPos, 0, t0 + 2000);
    expect(res.akzeptiert).toBe(false);
    expect(res.verdaechtigeSpruenge).toBe(1);
    expect(res.grund).toContain('TELEPORT_ERKANNT');
    expect(res.hostWarnung).toBe(false);
  });

  it('Schlaegt Host-Alarm bei 3 verdaechtigen Teleportationsspruengen', () => {
    const teleportPos: GpsUpdate = { lat: 52.53500, lng: 13.40500, genauigkeit: 5, zeit: t0 + 2000 };
    const res = pruefeGpsPlausibilitaet(startPos, teleportPos, 2, t0 + 2000);
    expect(res.akzeptiert).toBe(false);
    expect(res.verdaechtigeSpruenge).toBe(3);
    expect(res.hostWarnung).toBe(true);
  });

  it('Verwirft Zeitstempel-Replay oder Manipulation in die Zukunft', () => {
    const replayPos: GpsUpdate = { lat: 52.52001, lng: 13.40501, genauigkeit: 5, zeit: t0 - 1000 };
    const resReplay = pruefeGpsPlausibilitaet(startPos, replayPos, 0, t0 + 1000);
    expect(resReplay.akzeptiert).toBe(false);
    expect(resReplay.grund).toBe('ZEITSTEMPEL_REPLAY_ODER_RUECKWAERTS');

    const futurePos: GpsUpdate = { lat: 52.52001, lng: 13.40501, genauigkeit: 5, zeit: t0 + 60000 };
    const resFuture = pruefeGpsPlausibilitaet(startPos, futurePos, 0, t0);
    expect(resFuture.akzeptiert).toBe(false);
    expect(resFuture.grund).toBe('ZEITSTEMPEL_IN_ZUKUNFT');
  });
});
