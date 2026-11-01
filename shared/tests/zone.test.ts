import { describe, it, expect } from 'vitest';
import {
  berechneFolgeZone,
  erstelleZonenPlan,
  berechneAktuelleZone,
  Zone
} from '../src/zone.js';
import { haversineDistanz, zielPunkt } from '../src/geo.js';

describe('Zonenberechnung & Property-Tests', () => {
  it('Property-Test mit Sicherheits-Epsilon (0.5m): 10.000 Zufallszonen ragen nie über die Vorzone hinaus', () => {
    for (let i = 0; i < 10000; i++) {
      const lat = (Math.random() - 0.5) * 120; // -60 bis +60 Grad
      const lng = (Math.random() - 0.5) * 360; // -180 bis +180 Grad
      const rAlt = 150 + Math.random() * 9850; // 150m bis 10.000m
      const faktor = 0.4 + Math.random() * 0.5; // 0.4 bis 0.9

      const altZone: Zone = {
        mittelpunkt: { lat, lng },
        radiusMeter: rAlt
      };

      const neuZone = berechneFolgeZone(altZone, faktor, Math.random, 0.5);

      // 1. Neuer Radius muss exakt rAlt * faktor sein
      expect(neuZone.radiusMeter).toBeCloseTo(rAlt * faktor, 4);

      // 2. Mittelpunktsabstand + rNeu muss strikt <= rAlt sein
      const distanzZentren = haversineDistanz(
        altZone.mittelpunkt,
        neuZone.mittelpunkt
      );
      expect(distanzZentren + neuZone.radiusMeter).toBeLessThanOrEqual(rAlt);

      // 3. Strenge Randstichprobe: 8 Punkte auf der Kreislinie der neuen Zone müssen ausnahmslos <= rAlt liegen
      for (let winkel = 0; winkel < 360; winkel += 45) {
        const randPunkt = zielPunkt(
          neuZone.mittelpunkt,
          neuZone.radiusMeter,
          winkel
        );
        const distanzZuAltZentrum = haversineDistanz(
          altZone.mittelpunkt,
          randPunkt
        );
        expect(distanzZuAltZentrum).toBeLessThanOrEqual(rAlt);
      }
    }
  });

  it('erstellt konsistenten Zonenplan mit Vorwarnung und Schrumpfzeiten', () => {
    const startZone: Zone = {
      mittelpunkt: { lat: 52.5, lng: 13.4 },
      radiusMeter: 1000
    };
    const jagdStart = 1700000000000;
    const jagdDauerSekunden = 3000; // 50 Min

    const plan = erstelleZonenPlan(
      startZone,
      4,
      0.65,
      jagdStart,
      jagdDauerSekunden,
      60,
      90
    );

    expect(plan.length).toBe(5); // Stufe 0 bis 4
    expect(plan[0].stufe).toBe(0);
    expect(plan[0].radiusMeter).toBe(1000);

    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].stufe).toBe(i);
      expect(plan[i].radiusMeter).toBeCloseTo(plan[i - 1].radiusMeter * 0.65, 4);
      expect(plan[i].warnungZeitpunkt).toBeLessThan(
        plan[i].schrumpfStartZeitpunkt
      );
      expect(plan[i].schrumpfStartZeitpunkt).toBeLessThan(
        plan[i].schrumpfEndeZeitpunkt
      );
    }
  });

  it('interpoliert Zone korrekt während der Schrumpfphase', () => {
    const startZone: Zone = {
      mittelpunkt: { lat: 52.5, lng: 13.4 },
      radiusMeter: 1000
    };
    const jagdStart = 1000000;
    const plan = erstelleZonenPlan(startZone, 1, 0.5, jagdStart, 1000, 60, 100);

    const stufe1 = plan[1];

    // Vor Warnung: stabil
    const vorWarnung = berechneAktuelleZone(plan, stufe1.warnungZeitpunkt - 1000);
    expect(vorWarnung.status).toBe('stabil');
    expect(vorWarnung.zone.radiusMeter).toBe(1000);

    // Während Warnung: warnung
    const waehrendWarnung = berechneAktuelleZone(
      plan,
      stufe1.warnungZeitpunkt + 1000
    );
    expect(waehrendWarnung.status).toBe('warnung');

    // Mitten im Schrumpfen (50%): schrumpft
    const mittenSchrumpfen = berechneAktuelleZone(
      plan,
      stufe1.schrumpfStartZeitpunkt + 50000
    );
    expect(mittenSchrumpfen.status).toBe('schrumpft');
    expect(mittenSchrumpfen.zone.radiusMeter).toBeCloseTo(750, 0); // 1000 -> 500, Mitte = 750

    // Nach Schrumpfen: stabil mit neuem Radius
    const nachSchrumpfen = berechneAktuelleZone(
      plan,
      stufe1.schrumpfEndeZeitpunkt + 1000
    );
    expect(nachSchrumpfen.status).toBe('stabil');
    expect(nachSchrumpfen.zone.radiusMeter).toBeCloseTo(500, 4);
  });
});
