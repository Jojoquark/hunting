import { describe, it, expect } from 'vitest';
import { loeseTicket } from '../src/modi/mrx';
import { Spieler, SpielZustand } from '../src/types';

describe('Mr. X Ticket & Aufdecklogik', () => {
  it('Deckt Mr. X bei jedem 3. Ticket auf', () => {
    const mrx: Spieler = {
      id: 'mrx',
      spitzname: 'Mr. X',
      icon: 'hat',
      farbe: '#000000',
      rolle: 'mrx',
      bereit: true,
      online: true,
      energie: 100,
      position: { lat: 52.52, lng: 13.4, genauigkeit: 5, zeit: Date.now() },
      ausserhalbZone: false,
      gefangen: false,
      faehigkeitenStatus: { tarnkappeAktiv: false, abklingzeiten: {} }
    };

    const zustand = {
      jetzt: Date.now(),
      einstellungen: {
        mrxAufdeckRegel: 'tickets' as const,
        mrxAufdeckTicketIntervall: 3
      }
    } as SpielZustand;

    const t1 = loeseTicket(mrx, 'bus', '100', 'Alexanderplatz', zustand);
    expect(t1.aufgedeckt).toBe(false);

    const t2 = loeseTicket(mrx, 'ubahn', 'U2', 'Stadtmitte', zustand);
    expect(t2.aufgedeckt).toBe(false);

    const t3 = loeseTicket(mrx, 'tram', 'M1', 'Hackescher Markt', zustand);
    expect(t3.aufgedeckt).toBe(true);
  });
});
