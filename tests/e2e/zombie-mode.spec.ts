import { describe, it, expect, beforeEach } from 'vitest';
import { MockGameRoom } from '../fixtures/test-harness.js';

describe('Zombie Modus E2E', () => {
  let room: MockGameRoom;

  beforeEach(() => {
    room = new MockGameRoom('ZOMB01', 'zombie');
  });

  it('Gefangene Menschen verwandeln sich in Zombies', () => {
    const z1 = room.beitritt('z1', 'Ursprungs-Zombie', 'zombie');
    const m1 = room.beitritt('m1', 'Mensch 1', 'hider');
    const m2 = room.beitritt('m2', 'Mensch 2', 'hider');
    room.empfange('z1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const t = Date.now();
    room.empfange('z1', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: t, tempo: 2 });
    room.empfange('m1', { typ: 'ort', lat: 52.5201, lng: 13.4051, genauigkeit: 5, zeit: t, tempo: 0 });

    room.empfange('z1', { typ: 'fangen', zielId: 'm1' });
    expect(m1.rolle).toBe('zombie');
    expect(m1.team).toBe('zombie');
    expect(room.phase).toBe('jagd');
  });

  it('Menschen sehen Zombies nur mit 50m-Raster-Unschaerfe', () => {
    const z1 = room.beitritt('z1', 'Zombie', 'zombie');
    const m1 = room.beitritt('m1', 'Mensch', 'hider');
    room.empfange('z1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    const exakteLat = 52.52033;
    const exakteLng = 13.40588;
    room.empfange('z1', { typ: 'ort', lat: exakteLat, lng: exakteLng, genauigkeit: 5, zeit: Date.now(), tempo: 2 });

    const sichtNachrichten = m1.empfangeneNachrichten.filter((n) => n.typ === 'sicht') as any[];
    const letzteSicht = sichtNachrichten[sichtNachrichten.length - 1];
    const zombieSicht = letzteSicht.positionen.find((p: any) => p.spielerId === 'z1');

    expect(zombieSicht).toBeDefined();
    expect(zombieSicht.art).toBe('unscharf');
    expect(zombieSicht.lat).not.toBe(exakteLat);
  });
});
