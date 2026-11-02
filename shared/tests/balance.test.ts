import { describe, expect, it } from 'vitest';
import { empfohleneFaengerAnzahl, pruefeBalance } from '../src/balance';

describe('Balance von Ping, Vorsprung und Zone', () => {
  it('die drei Lobby-Presets gelten als ausgewogen', () => {
    for (const p of [
      { zonenRadiusMeter: 400, pingIntervallMinuten: 2, versteckZeitMinuten: 3, dauerMinuten: 20, zonenStufen: 3 },
      { zonenRadiusMeter: 1000, pingIntervallMinuten: 5, versteckZeitMinuten: 10, dauerMinuten: 60, zonenStufen: 4 },
      { zonenRadiusMeter: 4000, pingIntervallMinuten: 10, versteckZeitMinuten: 15, dauerMinuten: 120, zonenStufen: 5 }
    ]) {
      expect(pruefeBalance(p).probleme).toEqual([]);
    }
  });

  it('warnt bei seltenen Pings in kleiner Zone', () => {
    const e = pruefeBalance({ zonenRadiusMeter: 400, pingIntervallMinuten: 15, versteckZeitMinuten: 3, dauerMinuten: 60, zonenStufen: 2 });
    expect(e.probleme.map((p) => p.art)).toContain('ping_zu_selten');
    expect(e.empfehlung.pingIntervallMinuten).toBeLessThanOrEqual(e.pingBereich[1]);
  });

  it('warnt bei Dauer-Ping in großer Zone und zu kurzem Vorsprung', () => {
    const arten = pruefeBalance({ zonenRadiusMeter: 4000, pingIntervallMinuten: 1, versteckZeitMinuten: 1, dauerMinuten: 120, zonenStufen: 4 })
      .probleme.map((p) => p.art);
    expect(arten).toEqual(expect.arrayContaining(['ping_zu_haeufig', 'vorsprung_zu_kurz']));
  });

  it('Empfehlung selbst ist immer ohne Warnung', () => {
    for (const r of [150, 300, 700, 1000, 2500, 6000, 10000]) {
      for (const stufen of [0, 3, 8]) {
        const { empfehlung } = pruefeBalance({ zonenRadiusMeter: r, pingIntervallMinuten: 5, versteckZeitMinuten: 10, dauerMinuten: 60, zonenStufen: stufen });
        expect(pruefeBalance({ zonenRadiusMeter: r, zonenStufen: stufen, ...empfehlung }).probleme).toEqual([]);
      }
    }
  });

  it('Teamverhältnis: 1 Jäger gegen 7 ist zu wenig, Empfehlung passt', () => {
    const basis = { zonenRadiusMeter: 1000, pingIntervallMinuten: 5, versteckZeitMinuten: 10, dauerMinuten: 60, zonenStufen: 4, modus: 'klassisch' as const };
    const e = pruefeBalance({ ...basis, faenger: 1, gejagt: 7 });
    expect(e.probleme.map((p) => p.art)).toContain('zu_wenige_faenger');
    expect(e.empfohleneFaenger).toBe(2);
    expect(pruefeBalance({ ...basis, faenger: 2, gejagt: 6 }).probleme).toEqual([]);
    expect(pruefeBalance({ ...basis, faenger: 1, gejagt: 1 }).probleme).toEqual([]);
  });

  it('Teamverhältnis: Empfehlung ist für alle Modi und Gruppengrößen warnungsfrei', () => {
    for (const modus of ['klassisch', 'zombie', 'mrx'] as const) {
      for (let gesamt = 2; gesamt <= 20; gesamt++) {
        for (const r of [400, 1000, 4000]) {
          const faenger = empfohleneFaengerAnzahl(modus, gesamt, r);
          expect(faenger).toBeGreaterThanOrEqual(1);
          expect(faenger).toBeLessThan(gesamt);
          const arten = pruefeBalance({ zonenRadiusMeter: r, pingIntervallMinuten: 5, versteckZeitMinuten: 10, dauerMinuten: 60, zonenStufen: 0, modus, faenger, gejagt: gesamt - faenger })
            .probleme.map((p) => p.art).filter((a) => a.includes('faenger') || a === 'team_leer');
          expect(arten, `${modus} ${gesamt} Spieler ${r} m`).toEqual([]);
        }
      }
    }
  });
});
