import { describe, it, expect } from 'vitest';
import {
  haversineDistanz,
  peilungsWinkel,
  istPunktInKreis,
  zielPunkt,
  istGpsPlausibel,
  unschaerfeZombie
} from '../src/geo.js';

describe('Geo-Mathematik Tests', () => {
  it('berechnet Haversine-Distanz zwischen Berliner Wahrzeichen präzise', () => {
    // Brandenburger Tor (52.516275, 13.377704)
    // Berliner Fernsehturm (52.520816, 13.409419)
    const tor = { lat: 52.516275, lng: 13.377704 };
    const turm = { lat: 52.520816, lng: 13.409419 };

    const distanz = haversineDistanz(tor, turm);
    // Erwartete Distanz ca. 2210 m (+- 20 m)
    expect(distanz).toBeGreaterThan(2180);
    expect(distanz).toBeLessThan(2240);
  });

  it('ergibt Distanz 0 für identische Punkte', () => {
    const punkt = { lat: 48.137154, lng: 11.576124 };
    expect(haversineDistanz(punkt, punkt)).toBe(0);
  });

  it('berechnet Peilungswinkel in den 4 Himmelsrichtungen', () => {
    const zentrum = { lat: 0, lng: 0 };
    const nord = { lat: 1, lng: 0 };
    const ost = { lat: 0, lng: 1 };
    const sued = { lat: -1, lng: 0 };
    const west = { lat: 0, lng: -1 };

    expect(peilungsWinkel(zentrum, nord)).toBeCloseTo(0, 1);
    expect(peilungsWinkel(zentrum, ost)).toBeCloseTo(90, 1);
    expect(peilungsWinkel(zentrum, sued)).toBeCloseTo(180, 1);
    expect(peilungsWinkel(zentrum, west)).toBeCloseTo(270, 1);
  });

  it('prüft Punkt-in-Kreis korrekt', () => {
    const mitte = { lat: 50.0, lng: 10.0 };
    const innen = zielPunkt(mitte, 400, 45);
    const aussen = zielPunkt(mitte, 600, 45);

    expect(istPunktInKreis(innen, mitte, 500)).toBe(true);
    expect(istPunktInKreis(aussen, mitte, 500)).toBe(false);
  });

  it('erkennt unplausible GPS-Geschwindigkeitssprünge > 50 m/s', () => {
    const t0 = 1000000;
    const p1 = { lat: 52.5, lng: 13.4, zeit: t0 };

    // 100m in 10 Sekunden = 10 m/s (plausibel)
    const p2Plausibel = {
      ...zielPunkt(p1, 100, 0),
      zeit: t0 + 10000
    };
    const ergebnis1 = istGpsPlausibel(p1, p2Plausibel);
    expect(ergebnis1.plausibel).toBe(true);
    expect(ergebnis1.geschwindigkeitMeterProSekunde).toBeCloseTo(10, 0);

    // 1000m in 5 Sekunden = 200 m/s (Teleport/Sprung unplausibel)
    const p2Unplausibel = {
      ...zielPunkt(p1, 1000, 0),
      zeit: t0 + 5000
    };
    const ergebnis2 = istGpsPlausibel(p1, p2Unplausibel);
    expect(ergebnis2.plausibel).toBe(false);
    expect(ergebnis2.geschwindigkeitMeterProSekunde).toBeGreaterThan(50);
  });

  it('Zombie-Unschärfe: bleibt innerhalb einer Minute identisch und weicht 15-50m ab', () => {
    const real = { lat: 52.52, lng: 13.405 };
    const t0 = Math.floor(1700000000000 / 60000) * 60000; // Beginn einer Minute
    const t1 = t0 + 15000; // 15 Sek später (gleiche Minute)
    const t2 = t0 + 45000; // 45 Sek später (gleiche Minute)
    const tNextMin = t0 + 65000; // nächste Minute (65 Sek)

    const u0 = unschaerfeZombie(real, 'zombie-1', t0);
    const u1 = unschaerfeZombie(real, 'zombie-1', t1);
    const u2 = unschaerfeZombie(real, 'zombie-1', t2);
    const uNext = unschaerfeZombie(real, 'zombie-1', tNextMin);

    // Gleiche Minute muss mathematisch exakt dieselben Werte liefern
    expect(u0.lat).toBe(u1.lat);
    expect(u0.lng).toBe(u1.lng);
    expect(u0.lat).toBe(u2.lat);
    expect(u0.lng).toBe(u2.lng);

    // Distanz zum echten Punkt zwischen 15 und 60m
    const distanz = haversineDistanz(real, u0);
    expect(distanz).toBeGreaterThan(10);
    expect(distanz).toBeLessThan(65);

    // In der nächsten Minute ändert sich der Versatz
    expect(u0.lat !== uNext.lat || u0.lng !== uNext.lng).toBe(true);
  });
});
