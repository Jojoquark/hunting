import { Koordinate, haversineDistanz, zielPunkt } from './geo.js';

export interface Zone {
  mittelpunkt: Koordinate;
  radiusMeter: number;
}

export interface ZonenStufe extends Zone {
  stufe: number;
  warnungZeitpunkt: number;
  schrumpfStartZeitpunkt: number;
  schrumpfEndeZeitpunkt: number;
}

/**
 * Berechnet die nächste Zonenstufe:
 * r_neu = r_alt * faktor
 * M_neu = zufälliger Punkt mit Distanz <= r_alt - r_neu zu M_alt.
 * Mathematischer Beweis: Durch die Dreiecksungleichung gilt für jeden Punkt P
 * im neuen Kreis: dist(P, M_alt) <= dist(P, M_neu) + dist(M_neu, M_alt) <= r_neu + (r_alt - r_neu) = r_alt.
 * Folglich liegt der Folgekreis IMMER zu 100% vollständig im alten Kreis.
 */
export function berechneFolgeZone(
  vorherigeZone: Zone,
  faktor: number,
  zufallsGenerator: () => number = Math.random,
  sicherheitsEpsilonMeter = 0.5
): Zone {
  const rAlt = vorherigeZone.radiusMeter;
  const rNeu = rAlt * faktor;
  const theoretischerMaxAbstand = rAlt - rNeu;

  // 0.5m Puffer abziehen
  const maxAbstand = Math.max(0, theoretischerMaxAbstand - sicherheitsEpsilonMeter);

  if (maxAbstand <= 0) {
    return {
      mittelpunkt: { ...vorherigeZone.mittelpunkt },
      radiusMeter: rNeu
    };
  }

  // Flächengleiche Zufallsverteilung im Kreis via sqrt(u)
  const u = zufallsGenerator();
  const v = zufallsGenerator();
  const distanz = maxAbstand * Math.sqrt(u);
  const peilung = v * 360;

  const mNeu = zielPunkt(vorherigeZone.mittelpunkt, distanz, peilung);

  return {
    mittelpunkt: mNeu,
    radiusMeter: rNeu
  };
}

/**
 * Erstellt den vollständigen Zonenplan für die gesamte Jagddauer.
 */
export function erstelleZonenPlan(
  startZone: Zone,
  stufenAnzahl: number,
  faktor: number,
  jagdStartZeit: number,
  jagdDauerSekunden: number,
  warnungVorlaufSekunden = 60,
  schrumpfDauerSekunden = 90,
  zufallsGenerator: () => number = Math.random
): ZonenStufe[] {
  const stufen: ZonenStufe[] = [];
  let aktuelleZone = startZone;

  stufen.push({
    stufe: 0,
    mittelpunkt: startZone.mittelpunkt,
    radiusMeter: startZone.radiusMeter,
    warnungZeitpunkt: jagdStartZeit,
    schrumpfStartZeitpunkt: jagdStartZeit,
    schrumpfEndeZeitpunkt: jagdStartZeit
  });

  if (stufenAnzahl <= 0) {
    return stufen;
  }

  const intervallSekunden = jagdDauerSekunden / (stufenAnzahl + 1);

  for (let s = 1; s <= stufenAnzahl; s++) {
    const folgeZone = berechneFolgeZone(aktuelleZone, faktor, zufallsGenerator, 0.5);
    const schrumpfStart =
      jagdStartZeit + Math.round(s * intervallSekunden * 1000);
    const warnung = schrumpfStart - warnungVorlaufSekunden * 1000;
    const schrumpfEnde = schrumpfStart + schrumpfDauerSekunden * 1000;

    stufen.push({
      stufe: s,
      mittelpunkt: folgeZone.mittelpunkt,
      radiusMeter: folgeZone.radiusMeter,
      warnungZeitpunkt: warnung,
      schrumpfStartZeitpunkt: schrumpfStart,
      schrumpfEndeZeitpunkt: schrumpfEnde
    });

    aktuelleZone = folgeZone;
  }

  return stufen;
}

/**
 * Ermittelt den aktuellen Zonenstatus und interpoliert die Kreisgrenzen während der Schrumpfphase.
 */
export function berechneAktuelleZone(
  plan: ZonenStufe[],
  zeitpunkt: number
): {
  zone: Zone;
  status: 'stabil' | 'warnung' | 'schrumpft';
  aktiveStufe: number;
  naechsteStufe?: ZonenStufe;
  fortschrittSchrumpfung?: number;
} {
  if (plan.length === 0) {
    throw new Error('Zonenplan darf nicht leer sein');
  }

  let basisStufeIndex = 0;
  for (let i = 0; i < plan.length; i++) {
    if (zeitpunkt >= plan[i].schrumpfEndeZeitpunkt) {
      basisStufeIndex = i;
    } else {
      break;
    }
  }

  const naechsteStufe = plan[basisStufeIndex + 1];

  if (!naechsteStufe || zeitpunkt < naechsteStufe.warnungZeitpunkt) {
    return {
      zone: {
        mittelpunkt: plan[basisStufeIndex].mittelpunkt,
        radiusMeter: plan[basisStufeIndex].radiusMeter
      },
      status: 'stabil',
      aktiveStufe: plan[basisStufeIndex].stufe
    };
  }

  if (zeitpunkt < naechsteStufe.schrumpfStartZeitpunkt) {
    return {
      zone: {
        mittelpunkt: plan[basisStufeIndex].mittelpunkt,
        radiusMeter: plan[basisStufeIndex].radiusMeter
      },
      status: 'warnung',
      aktiveStufe: plan[basisStufeIndex].stufe,
      naechsteStufe
    };
  }

  // Schrumpfungsphase
  const dauer =
    naechsteStufe.schrumpfEndeZeitpunkt - naechsteStufe.schrumpfStartZeitpunkt;
  const vergangen = zeitpunkt - naechsteStufe.schrumpfStartZeitpunkt;
  const t = Math.min(1, Math.max(0, vergangen / dauer));

  const alt = plan[basisStufeIndex];
  const neu = naechsteStufe;

  const lat = alt.mittelpunkt.lat + t * (neu.mittelpunkt.lat - alt.mittelpunkt.lat);
  const dLngRaw = neu.mittelpunkt.lng - alt.mittelpunkt.lng;
  const dLng = ((((dLngRaw + 180) % 360) + 360) % 360) - 180;
  let lng = alt.mittelpunkt.lng + t * dLng;
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  const radius = alt.radiusMeter + t * (neu.radiusMeter - alt.radiusMeter);

  return {
    zone: {
      mittelpunkt: { lat, lng },
      radiusMeter: radius
    },
    status: 'schrumpft',
    aktiveStufe: alt.stufe,
    naechsteStufe,
    fortschrittSchrumpfung: t
  };
}
