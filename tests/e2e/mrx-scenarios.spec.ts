import { describe, it, expect, beforeEach } from 'vitest';
import { MockGameRoom } from '../fixtures/test-harness.js';

describe('Mr. X & OEPNV Scenarios', () => {
  let room: MockGameRoom;

  beforeEach(() => {
    room = new MockGameRoom('MRX01', 'mrx');
  });

  it('Mr. X kauft Tickets, Detektive sehen Verkehrsmittel aber kein Ziel', () => {
    room.beitritt('d1', 'Detektiv 1', 'detektiv');
    room.beitritt('mrx', 'Mr. X', 'mrx');
    room.empfange('d1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'bus', linie: '100' });
    const ticketEvents = room.ereignisLog.filter((e) => e.art === 'ticket');
    expect(ticketEvents.length).toBe(1);
    expect(ticketEvents[0].payload.verkehrsmittel).toBe('bus');
  });

  it('Black Ticket verschleiert das Verkehrsmittel', () => {
    room.beitritt('d1', 'Detektiv 1', 'detektiv');
    room.beitritt('mrx', 'Mr. X', 'mrx');
    room.empfange('d1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'u-bahn', spezial: 'black' });
    const ticketEvents = room.ereignisLog.filter((e) => e.art === 'ticket');
    expect(ticketEvents[0].payload.verkehrsmittel).toBe('black');
  });

  it('Doppelzug laesst zwei Fahrten als ein Aufdeck-Intervall zaehlen', () => {
    room.beitritt('d1', 'Detektiv 1', 'detektiv');
    room.beitritt('mrx', 'Mr. X', 'mrx');
    room.empfange('d1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'bus', spezial: 'doppelzug' });
    expect(room.mrxDoppelzugAktiv).toBe(true);

    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'bus' });
    expect(room.mrxDoppelzugAktiv).toBe(false);
    expect(room.mrxTicketZaehler).toBe(0);
  });

  it('Aufdeckregel nach Tickets: Jedes 3. Ticket enthuellt Standort', () => {
    room.beitritt('d1', 'Detektiv 1', 'detektiv');
    const mrx = room.beitritt('mrx', 'Mr. X', 'mrx');
    room.empfange('d1', { typ: 'host', aktion: 'start' });
    room.wechsleZuJagd();

    room.empfange('mrx', { typ: 'ort', lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: Date.now(), tempo: 2 });
    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'bus' });
    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'tram' });
    expect(room.ereignisLog.some((e) => e.art === 'aufdeckung')).toBe(false);

    room.empfange('mrx', { typ: 'ticket', verkehrsmittel: 'u-bahn' });
    expect(room.ereignisLog.some((e) => e.art === 'aufdeckung')).toBe(true);
  });
});
