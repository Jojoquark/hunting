import { Spieler, SpielZustand, TicketTyp, MrXTicket } from '../types';
import { haversineDistanz } from '../geo';

export function loeseTicket(
  mrx: Spieler,
  typ: TicketTyp,
  linie?: string,
  haltestelle?: string,
  zustand?: SpielZustand
): { ticket: MrXTicket; aufgedeckt: boolean } {
  if (!mrx.mrxStatus) {
    mrx.mrxStatus = {
      tickets: [],
      blackTicketsVerbleibend: 2,
      doppelzugVerfuegbar: true,
      doppelzugAktiv: false,
      letztesAufdeckTicketNr: 0
    };
  }

  const status = mrx.mrxStatus;
  const jetzt = zustand ? zustand.jetzt : Date.now();

  if (typ === 'black') {
    if (status.blackTicketsVerbleibend <= 0) {
      throw new Error('Keine Black Tickets mehr verfügbar');
    }
    status.blackTicketsVerbleibend--;
  }

  if (typ === 'doppelzug') {
    if (!status.doppelzugVerfuegbar) {
      throw new Error('Doppelzug wurde bereits verwendet');
    }
    status.doppelzugVerfuegbar = false;
    status.doppelzugAktiv = true;
  }

  let sollAufdecken = false;

  // Aufdeckregel: Tickets
  if (zustand?.einstellungen.mrxAufdeckRegel === 'tickets') {
    const intervall = zustand.einstellungen.mrxAufdeckTicketIntervall || 3;
    const ticketIndex = status.tickets.length + 1;

    // Wenn Doppelzug aktiv ist, zählt der nächste Schritt nicht als Aufdeckschritt
    if (status.doppelzugAktiv) {
      status.doppelzugAktiv = false;
    } else {
      if ((ticketIndex - status.letztesAufdeckTicketNr) >= intervall) {
        sollAufdecken = true;
        status.letztesAufdeckTicketNr = ticketIndex;
      }
    }
  }

  if (sollAufdecken && mrx.position) {
    status.letzteAufdeckungKoordinate = { lat: mrx.position.lat, lng: mrx.position.lng };
    status.letzteAufdeckungZeit = jetzt;
  }

  const ticket: MrXTicket = {
    id: `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    typ,
    linie: typ === 'black' ? undefined : linie,
    haltestelle: typ === 'black' ? undefined : haltestelle,
    zeit: jetzt,
    aufgedeckt: sollAufdecken
  };

  status.tickets.push(ticket);

  return { ticket, aufgedeckt: sollAufdecken };
}

export function pruefeMrXEntfernungsAufdeckung(mrx: Spieler, zustand: SpielZustand): boolean {
  if (zustand.einstellungen.mrxAufdeckRegel !== 'entfernung' || !mrx.position) {
    return false;
  }

  const schwellenMeter = zustand.einstellungen.mrxAufdeckDistanzMeter || 2000;
  const status = mrx.mrxStatus;
  if (!status) return false;

  if (!status.letzteAufdeckungKoordinate) {
    status.letzteAufdeckungKoordinate = { lat: mrx.position.lat, lng: mrx.position.lng };
    status.letzteAufdeckungZeit = zustand.jetzt;
    return true;
  }

  const distanz = haversineDistanz(mrx.position, status.letzteAufdeckungKoordinate);
  if (distanz >= schwellenMeter) {
    status.letzteAufdeckungKoordinate = { lat: mrx.position.lat, lng: mrx.position.lng };
    status.letzteAufdeckungZeit = zustand.jetzt;
    return true;
  }

  return false;
}

export function pruefeDetektivTempo(detektiv: Spieler): boolean {
  // Warnung wenn Detective > 25 km/h (ca. 6.94 m/s) unterwegs ist
  if (detektiv.position?.tempo && detektiv.position.tempo > 6.94) {
    return true;
  }
  return false;
}
