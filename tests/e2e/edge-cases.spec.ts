import { describe, it, expect, beforeEach } from 'vitest';
import { MockGameRoom } from '../fixtures/test-harness.js';

describe('Edge Cases & Resilienz', () => {
  let room: MockGameRoom;

  beforeEach(() => {
    room = new MockGameRoom('EDGE01', 'klassisch');
  });

  it('Verbindungsabbruch und Reconnect mit State-Synchronisation', () => {
    const s1 = room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    room.trenne('h1');
    expect(h1.online).toBe(false);

    room.verbindeWieder('h1');
    expect(h1.online).toBe(true);
    const letzteNachricht = h1.empfangeneNachrichten[h1.empfangeneNachrichten.length - 1];
    expect(letzteNachricht.typ).toBe('zustand');
  });

  it('Zone verlassen loest Auto-Fang nach 60 Sekunden Kulanzzeit aus', () => {
    room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const punktDraussen = { lat: 52.55, lng: 13.405 };
    let zeit = Date.now();

    for (let sek = 5; sek <= 55; sek += 5) {
      room.empfange('h1', { typ: 'ort', ...punktDraussen, genauigkeit: 5, zeit, tempo: 1 });
      zeit += 5000;
      expect(h1.gefangen).toBe(false);
    }

    room.empfange('h1', { typ: 'ort', ...punktDraussen, genauigkeit: 5, zeit, tempo: 1 });
    expect(h1.gefangen).toBe(true);
    expect(room.ereignisLog.some((e) => e.art === 'autoFangZoneVerlassen')).toBe(true);
  });

  it('Funkloch-Strafe: Veraltete Position fuehrt zu 60s Live-Sichtbarkeit', () => {
    const s1 = room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const altesDatum = Date.now() - 100000;
    room.empfange('h1', { typ: 'ort', lat: 52.5205, lng: 13.4055, genauigkeit: 5, zeit: altesDatum, tempo: 0 });

    room.loesePingAus();
    expect(room.ereignisLog.some((e) => e.art === 'pingSignalVerloren')).toBe(true);
    expect(h1.funklochStrafeBis).toBeDefined();

    room.empfange('s1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: Date.now(), tempo: 0 });
    const sichtNachrichten = s1.empfangeneNachrichten.filter((n) => n.typ === 'sicht') as any[];
    const letzteSicht = sichtNachrichten[sichtNachrichten.length - 1];
    expect(letzteSicht.positionen.some((p: any) => p.spielerId === 'h1' && p.art === 'live')).toBe(true);
  });

  it('Anti-Cheat: GPS-Spruenge > 50 m/s werden verworfen und gezaehlt', () => {
    room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const t0 = Date.now();
    room.empfange('h1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: t0, tempo: 1 });

    const t1 = t0 + 1000;
    room.empfange('h1', { typ: 'ort', lat: 52.5300, lng: 13.4050, genauigkeit: 5, zeit: t1, tempo: 1 });

    expect(room.verdaechtigeSpruenge.get('h1')).toBe(1);
    expect(h1.position?.lat).toBe(52.5200);
  });
});
