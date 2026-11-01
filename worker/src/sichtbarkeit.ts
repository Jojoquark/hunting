import { Spieler, SpielZustand, SichtbarkeitErgebnis } from './types';
import { zombieUnschaerfe } from './geo';

/**
 * Kernfunktion der Spiel-Engine:
 * Liefert für jedes Paar (Betrachter, Ziel) das strikt server-autoritativ gefilterte Sichtbarkeitsergebnis.
 * Keine Koordinaten eines Hiders dürfen an Seeker vor einem Ping oder außerhalb der Zone geleakt werden.
 */
export function sichtbarFuer(
  betrachter: Spieler,
  ziel: Spieler,
  zustand: SpielZustand
): SichtbarkeitErgebnis {
  // 1. Man selbst sieht sich immer live
  if (betrachter.id === ziel.id) {
    if (!ziel.position) return { art: 'unsichtbar' };
    return { art: 'live', position: ziel.position };
  }

  // 2. Spielende: Alle Spieler sind live sichtbar
  if (zustand.phase === 'ende') {
    if (!ziel.position) return { art: 'unsichtbar' };
    return { art: 'live', position: ziel.position };
  }

  // 3. Zuschauer (gefangene Spieler in Klassisch) sehen alle Spieler live
  if (betrachter.rolle === 'zuschauer') {
    if (!ziel.position) return { art: 'unsichtbar' };
    return { art: 'live', position: ziel.position };
  }

  // Wenn Ziel keine Position hat, ist es nicht darstellbar
  if (!ziel.position) {
    return { art: 'unsichtbar' };
  }

  // 4. Anti-Cheat: Zone verlassen -> sofort live für ALLE Gegner
  if (ziel.ausserhalbZone) {
    return { art: 'live', position: ziel.position };
  }

  // 5. Funkloch-Strafe: War beim Ping offline/verspätet -> 60 Sek. live
  if (ziel.funklochStrafeBis && zustand.jetzt < ziel.funklochStrafeBis) {
    return { art: 'live', position: ziel.position };
  }

  // 6. Team-Interne Sichtbarkeit
  if (betrachter.rolle === ziel.rolle) {
    // Seeker sehen Seeker live
    // Hider sehen Hider live
    // Zombies sehen Zombies live
    // Menschen sehen Menschen live
    // Detektive sehen Detektive live
    return { art: 'live', position: ziel.position };
  }

  // 7. Modus-spezifische Sichtbarkeitsregeln
  switch (zustand.modus) {
    case 'klassisch': {
      // Betrachter = Seeker, Ziel = Hider
      if (betrachter.rolle === 'seeker' && ziel.rolle === 'hider') {
        // Fähigkeit: Tarnkappe aktiv? -> Ping wird unterdrückt
        if (ziel.faehigkeitenStatus.tarnkappeAktiv) {
          return { art: 'unsichtbar' };
        }

        // Fähigkeit: Köder aktiv? -> Köderpunkt statt echte Position als Ping
        if (ziel.faehigkeitenStatus.koederPunkt) {
          return {
            art: 'ping',
            position: ziel.faehigkeitenStatus.koederPunkt,
            alterSekunden: 0,
            istKoeder: true
          };
        }

        // Ping-Darstellung (letzter bekannter Ping)
        if (ziel.letzterPingPosition && ziel.letzterPingZeit) {
          const alterSek = Math.max(0, Math.floor((zustand.jetzt - ziel.letzterPingZeit) / 1000));
          return {
            art: 'ping',
            position: ziel.letzterPingPosition,
            alterSekunden: alterSek
          };
        }

        return { art: 'unsichtbar' };
      }

      // Betrachter = Hider, Ziel = Seeker
      if (betrachter.rolle === 'hider' && ziel.rolle === 'seeker') {
        // Fähigkeit: Radar aktiv (15 Sek. alle Seeker live)
        if (betrachter.faehigkeitenStatus.radarBis && zustand.jetzt < betrachter.faehigkeitenStatus.radarBis) {
          return { art: 'live', position: ziel.position };
        }
        // Hider sehen Seeker sonst nie auf der Karte (nur Warnmeldung < 100m)
        return { art: 'unsichtbar' };
      }

      return { art: 'unsichtbar' };
    }

    case 'zombie': {
      // Betrachter = Mensch, Ziel = Zombie
      if (betrachter.rolle === 'mensch' && ziel.rolle === 'zombie') {
        // Menschen sehen Zombies live, aber 50m unscharf
        const unscharfKoord = zombieUnschaerfe(ziel.position, zustand.jetzt);
        return { art: 'unscharf', position: unscharfKoord };
      }

      // Betrachter = Zombie, Ziel = Mensch
      if (betrachter.rolle === 'zombie' && ziel.rolle === 'mensch') {
        // Zombies sehen Menschen nur bei Pings
        if (ziel.faehigkeitenStatus.tarnkappeAktiv) {
          return { art: 'unsichtbar' };
        }
        if (ziel.faehigkeitenStatus.koederPunkt) {
          return {
            art: 'ping',
            position: ziel.faehigkeitenStatus.koederPunkt,
            alterSekunden: 0,
            istKoeder: true
          };
        }
        if (ziel.letzterPingPosition && ziel.letzterPingZeit) {
          const alterSek = Math.max(0, Math.floor((zustand.jetzt - ziel.letzterPingZeit) / 1000));
          return {
            art: 'ping',
            position: ziel.letzterPingPosition,
            alterSekunden: alterSek
          };
        }
        return { art: 'unsichtbar' };
      }

      return { art: 'unsichtbar' };
    }

    case 'mrx': {
      // Betrachter = Detektiv, Ziel = MrX
      if (betrachter.rolle === 'detektiv' && ziel.rolle === 'mrx') {
        if (ziel.faehigkeitenStatus.tarnkappeAktiv) {
          return { art: 'unsichtbar' };
        }

        // Wurde Mr. X durch Tickets, Distanz oder Zeit aufgedeckt?
        if (ziel.mrxStatus?.letzteAufdeckungKoordinate && ziel.mrxStatus.letzteAufdeckungZeit) {
          const alterSek = Math.max(0, Math.floor((zustand.jetzt - ziel.mrxStatus.letzteAufdeckungZeit) / 1000));
          return {
            art: 'ping',
            position: ziel.mrxStatus.letzteAufdeckungKoordinate,
            alterSekunden: alterSek
          };
        }

        return { art: 'unsichtbar' };
      }

      // Betrachter = MrX, Ziel = Detektiv
      if (betrachter.rolle === 'mrx' && ziel.rolle === 'detektiv') {
        if (zustand.einstellungen.mrxSiehtDetektive) {
          return { art: 'live', position: ziel.position };
        }
        return { art: 'unsichtbar' };
      }

      return { art: 'unsichtbar' };
    }

    default:
      return { art: 'unsichtbar' };
  }
}
