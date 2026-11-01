import { Spieler, SpielZustand, FaehigkeitId, Koordinate } from './types';
import { peilungGrad, haversineDistanz } from './geo';

export interface FaehigkeitsKatalogEintrag {
  id: FaehigkeitId;
  seite: 'hider' | 'seeker';
  kosten: number;
  abklingzeitSekunden: number;
  einmalig?: boolean;
}

export const FAEHIGKEITEN_KATALOG: Record<FaehigkeitId, FaehigkeitsKatalogEintrag> = {
  tarnkappe: { id: 'tarnkappe', seite: 'hider', kosten: 60, abklingzeitSekunden: 600 },
  koeder: { id: 'koeder', seite: 'hider', kosten: 50, abklingzeitSekunden: 600 },
  radar: { id: 'radar', seite: 'hider', kosten: 40, abklingzeitSekunden: 300 },
  stoersender: { id: 'stoersender', seite: 'hider', kosten: 50, abklingzeitSekunden: 480 },
  schild: { id: 'schild', seite: 'hider', kosten: 70, abklingzeitSekunden: 0, einmalig: true },
  sonderping: { id: 'sonderping', seite: 'seeker', kosten: 60, abklingzeitSekunden: 480 },
  peilung: { id: 'peilung', seite: 'seeker', kosten: 40, abklingzeitSekunden: 300 },
  sonar: { id: 'sonar', seite: 'seeker', kosten: 30, abklingzeitSekunden: 180 },
  blackout: { id: 'blackout', seite: 'seeker', kosten: 70, abklingzeitSekunden: 720 },
  zonenstoss: { id: 'zonenstoss', seite: 'seeker', kosten: 60, abklingzeitSekunden: 0, einmalig: true }
};

export function nutzeFaehigkeit(
  anwender: Spieler,
  faehigkeitId: FaehigkeitId,
  parameter: { koederPunkt?: Koordinate } | undefined,
  zustand: SpielZustand
): { erfolg: boolean; nachricht?: string; daten?: Record<string, unknown> } {
  if (!zustand.einstellungen.faehigkeitenAktiv) {
    return { erfolg: false, nachricht: 'Fähigkeiten sind in diesem Spiel deaktiviert' };
  }

  if (zustand.einstellungen.faehigkeitenSchalter[faehigkeitId] === false) {
    return { erfolg: false, nachricht: `Die Fähigkeit ${faehigkeitId} ist deaktiviert` };
  }

  // Blackout-Prüfung
  if (anwender.faehigkeitenStatus.blackoutBis && zustand.jetzt < anwender.faehigkeitenStatus.blackoutBis) {
    return { erfolg: false, nachricht: 'Deine Fähigkeiten sind durch einen Blackout blockiert!' };
  }

  const meta = FAEHIGKEITEN_KATALOG[faehigkeitId];
  if (!meta) {
    return { erfolg: false, nachricht: 'Unbekannte Fähigkeit' };
  }

  // Rollenseite prüfen
  const istHiderSeite = ['hider', 'mensch', 'mrx'].includes(anwender.rolle);
  const istSeekerSeite = ['seeker', 'zombie', 'detektiv'].includes(anwender.rolle);

  if ((meta.seite === 'hider' && !istHiderSeite) || (meta.seite === 'seeker' && !istSeekerSeite)) {
    return { erfolg: false, nachricht: 'Fähigkeit passt nicht zu deiner Rolle' };
  }

  // Energiekosten prüfen
  if (anwender.energie < meta.kosten) {
    return { erfolg: false, nachricht: 'Nicht genügend Energie' };
  }

  // Abklingzeit prüfen
  const cdEnde = anwender.faehigkeitenStatus.abklingzeiten[faehigkeitId] || 0;
  if (zustand.jetzt < cdEnde) {
    const restSek = Math.ceil((cdEnde - zustand.jetzt) / 1000);
    return { erfolg: false, nachricht: `Noch ${restSek}s Abklingzeit` };
  }

  // Kosten abziehen
  anwender.energie -= meta.kosten;
  if (meta.abklingzeitSekunden > 0) {
    anwender.faehigkeitenStatus.abklingzeiten[faehigkeitId] = zustand.jetzt + meta.abklingzeitSekunden * 1000;
  }

  // Wirkung ausführen
  switch (faehigkeitId) {
    case 'tarnkappe':
      anwender.faehigkeitenStatus.tarnkappeAktiv = true;
      return { erfolg: true, nachricht: 'Tarnkappe aktiv: Nächster Ping wird unterdrückt' };

    case 'koeder':
      if (!parameter?.koederPunkt) {
        return { erfolg: false, nachricht: 'Köderpunkt fehlt' };
      }
      anwender.faehigkeitenStatus.koederPunkt = parameter.koederPunkt;
      return { erfolg: true, nachricht: 'Köder platziert: Nächster Ping zeigt Köderpunkt' };

    case 'radar':
      anwender.faehigkeitenStatus.radarBis = zustand.jetzt + 15000; // 15 Sek
      return { erfolg: true, nachricht: 'Radar aktiv: 15 Sek. alle Jäger live sichtbar' };

    case 'stoersender':
      anwender.faehigkeitenStatus.stoersenderBis = zustand.jetzt + 60000; // 60 Sek
      return { erfolg: true, nachricht: 'Störsender aktiv: 60 Sek. kein Fang in 150m Umkreis' };

    case 'schild':
      anwender.faehigkeitenStatus.schildBis = zustand.jetzt + 30000; // 30 Sek
      anwender.faehigkeitenStatus.abklingzeiten[faehigkeitId] = Infinity; // 1x pro Spiel
      return { erfolg: true, nachricht: 'Schild aktiv: 30 Sek. nicht fangbar' };

    case 'sonderping': {
      const hiders = Object.values(zustand.spieler).filter((s) => ['hider', 'mensch', 'mrx'].includes(s.rolle) && !s.gefangen && s.position);
      if (hiders.length === 0) {
        return { erfolg: false, nachricht: 'Keine Hider im Spiel' };
      }
      const zufallHider = hiders[Math.floor(Math.random() * hiders.length)];
      zufallHider.letzterPingPosition = zufallHider.position ? { lat: zufallHider.position.lat, lng: zufallHider.position.lng } : undefined;
      zufallHider.letzterPingZeit = zustand.jetzt;
      return {
        erfolg: true,
        nachricht: `Sonderping für ${zufallHider.spitzname} ausgelöst`,
        daten: { zielId: zufallHider.id, position: zufallHider.letzterPingPosition }
      };
    }

    case 'peilung': {
      if (!anwender.position) return { erfolg: false, nachricht: 'Keine eigene Position' };
      const hiders = Object.values(zustand.spieler).filter((s) => ['hider', 'mensch', 'mrx'].includes(s.rolle) && !s.gefangen && s.position);
      if (hiders.length === 0) return { erfolg: false, nachricht: 'Keine Ziele gefunden' };

      let minAbstand = Infinity;
      let ziel: Spieler | null = null;
      for (const h of hiders) {
        if (!h.position) continue;
        const dist = haversineDistanz(anwender.position, h.position);
        if (dist < minAbstand) {
          minAbstand = dist;
          ziel = h;
        }
      }

      if (!ziel || !ziel.position) return { erfolg: false, nachricht: 'Kein Ziel erreichbar' };
      const grad = peilungGrad(anwender.position, ziel.position);
      anwender.faehigkeitenStatus.peilungBis = zustand.jetzt + 20000; // 20 Sek. Pfeil
      return {
        erfolg: true,
        nachricht: 'Peilung zum nächsten Gejagten aktiv (20 Sek.)',
        daten: { peilungGrad: Math.round(grad) }
      };
    }

    case 'sonar': {
      if (!anwender.position) return { erfolg: false, nachricht: 'Keine eigene Position' };
      const anzahl = Object.values(zustand.spieler).filter((s) => {
        if (!['hider', 'mensch', 'mrx'].includes(s.rolle) || s.gefangen || !s.position) return false;
        return haversineDistanz(anwender.position!, s.position) <= 250;
      }).length;

      return {
        erfolg: true,
        nachricht: `Sonar: ${anzahl} Gejagte im Umkreis von 250m geortet`,
        daten: { anzahlImUmkreis: anzahl }
      };
    }

    case 'blackout': {
      for (const s of Object.values(zustand.spieler)) {
        if (['hider', 'mensch', 'mrx'].includes(s.rolle)) {
          s.faehigkeitenStatus.blackoutBis = zustand.jetzt + 120000; // 2 Min
        }
      }
      return { erfolg: true, nachricht: 'Blackout: Gejagte können 2 Min. keine Fähigkeiten nutzen' };
    }

    case 'zonenstoss': {
      anwender.faehigkeitenStatus.abklingzeiten[faehigkeitId] = Infinity;
      return {
        erfolg: true,
        nachricht: 'Zonenstoß ausgelöst: Zonenverkleinerung vorgezogen',
        daten: { verfruehungSekunden: 120 }
      };
    }

    default:
      return { erfolg: false, nachricht: 'Nicht implementiert' };
  }
}
