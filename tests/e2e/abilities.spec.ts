import { describe, it, expect, beforeEach } from 'vitest';
import { MockGameRoom } from '../fixtures/test-harness.js';

describe('Faehigkeiten E2E', () => {
  let room: MockGameRoom;

  beforeEach(() => {
    room = new MockGameRoom('ABIL01', 'klassisch');
  });

  it('Schild blockiert das Fangen fuer 30 Sekunden', () => {
    const s1 = room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const t = Date.now();
    room.empfange('s1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: t, tempo: 0 });
    room.empfange('h1', { typ: 'ort', lat: 52.5201, lng: 13.4051, genauigkeit: 5, zeit: t, tempo: 0 });

    room.empfange('h1', { typ: 'faehigkeit', id: 'schild' });
    expect(h1.schildAktivBis).toBeGreaterThan(t);

    room.empfange('s1', { typ: 'fangen', zielId: 'h1' });
    expect(h1.gefangen).toBe(false);
    expect(room.ereignisLog.some((e) => e.art === 'fangAbgelehnt' && e.payload.grund === 'schild')).toBe(true);
  });

  it('Stoersender verhindert Fangen im 150m-Umkreis fuer 60 Sekunden', () => {
    const s1 = room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider 1', 'hider');
    const h2 = room.beitritt('h2', 'Hider 2', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const t = Date.now();
    room.empfange('s1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: t, tempo: 0 });
    room.empfange('h1', { typ: 'ort', lat: 52.5202, lng: 13.4050, genauigkeit: 5, zeit: t, tempo: 0 });
    room.empfange('h2', { typ: 'ort', lat: 52.5201, lng: 13.4051, genauigkeit: 5, zeit: t, tempo: 0 });

    room.empfange('h1', { typ: 'faehigkeit', id: 'stoersender' });
    room.empfange('s1', { typ: 'fangen', zielId: 'h2' });
    expect(h2.gefangen).toBe(false);
  });

  it('Radar enthuellt Seeker fuer 15 Sekunden live', () => {
    const s1 = room.beitritt('s1', 'Seeker', 'seeker');
    const h1 = room.beitritt('h1', 'Hider', 'hider');
    room.empfange('s1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const t = Date.now();
    room.empfange('s1', { typ: 'ort', lat: 52.5210, lng: 13.4060, genauigkeit: 5, zeit: t, tempo: 0 });
    room.empfange('h1', { typ: 'faehigkeit', id: 'radar' });

    room.empfange('s1', { typ: 'ort', lat: 52.5210, lng: 13.4060, genauigkeit: 5, zeit: t + 100, tempo: 0 });
    const h1Nachrichten = h1.empfangeneNachrichten.filter((n) => n.typ === 'sicht') as any[];
    const letzteSicht = h1Nachrichten[h1Nachrichten.length - 1];
    expect(letzteSicht.positionen.some((p: any) => p.spielerId === 's1' && p.art === 'live')).toBe(true);
  });
});
