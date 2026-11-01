import { describe, it, expect, beforeEach } from 'vitest';
import { MockGameRoom } from '../fixtures/test-harness.js';

describe('Game Lifecycle E2E', () => {
  let room: MockGameRoom;

  beforeEach(() => {
    room = new MockGameRoom('LIFE01', 'klassisch');
  });

  it('fuehrt ein komplettes Spiel von Erstellung bis Ende durch', () => {
    const seeker = room.beitritt('s1', 'Seeker 1', 'seeker');
    const hider1 = room.beitritt('h1', 'Hider 1', 'hider');
    const hider2 = room.beitritt('h2', 'Hider 2', 'hider');

    expect(room.phase).toBe('lobby');
    expect(room.spieler.size).toBe(3);

    room.empfange('s1', { typ: 'host', aktion: 'start' });
    expect(room.phase).toBe('verstecken');

    room.wechsleZuJagd();
    expect(room.phase).toBe('jagd');

    const jetzt = Date.now();
    room.empfange('s1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: jetzt, tempo: 2 });
    room.empfange('h1', { typ: 'ort', lat: 52.5201, lng: 13.4051, genauigkeit: 5, zeit: jetzt, tempo: 0 });
    room.empfange('h2', { typ: 'ort', lat: 52.5240, lng: 13.4090, genauigkeit: 5, zeit: jetzt, tempo: 0 });

    room.loesePingAus();
    const pingEvents = room.ereignisLog.filter((e) => e.art === 'ping');
    expect(pingEvents.length).toBe(1);

    room.empfange('s1', { typ: 'fangen', zielId: 'h1' });
    expect(hider1.gefangen).toBe(true);
    expect(room.phase).toBe('jagd');

    room.empfange('s1', { typ: 'ort', lat: 52.5239, lng: 13.4089, genauigkeit: 5, zeit: jetzt + 25000, tempo: 3 });
    room.empfange('s1', { typ: 'fangen', zielId: 'h2' });
    expect(hider2.gefangen).toBe(true);

    expect(room.phase).toBe('ende');
    expect(room.ereignisLog.some((e) => e.art === 'phase' && e.payload === 'ende')).toBe(true);
  });
});
