import { Koordinate } from './types.js';

const ERDRADIUS_METER = 6371000;

export function berechneAbstandMeter(a: Koordinate, b: Koordinate): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const f =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * ERDRADIUS_METER * Math.atan2(Math.sqrt(f), Math.sqrt(1 - f));
}

export function berechnePeilungGrad(von: Koordinate, nach: Koordinate): number {
  const lat1 = (von.lat * Math.PI) / 180;
  const lat2 = (nach.lat * Math.PI) / 180;
  const dLng = ((nach.lng - von.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function bewegeInRichtung(
  start: Koordinate,
  distanzMeter: number,
  peilungGrad: number
): Koordinate {
  const dR = distanzMeter / ERDRADIUS_METER;
  const theta = (peilungGrad * Math.PI) / 180;
  const lat1 = (start.lat * Math.PI) / 180;
  const lng1 = (start.lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(theta)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(dR) * Math.cos(lat1),
      Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI
  };
}

export function istInZone(punkt: Koordinate, zentrum: Koordinate, radiusMeter: number): boolean {
  return berechneAbstandMeter(punkt, zentrum) <= radiusMeter;
}

export function erzeugeZufaelligenPunktInZone(
  zentrum: Koordinate,
  maxRadiusMeter: number
): Koordinate {
  const r = maxRadiusMeter * Math.sqrt(Math.random());
  const theta = Math.random() * 360;
  return bewegeInRichtung(zentrum, r, theta);
}

export function bewegeRichtungZiel(
  aktuell: Koordinate,
  ziel: Koordinate,
  schrittweiteMeter: number
): Koordinate {
  const abstand = berechneAbstandMeter(aktuell, ziel);
  if (abstand <= schrittweiteMeter) {
    return { ...ziel };
  }
  const peilung = berechnePeilungGrad(aktuell, ziel);
  return bewegeInRichtung(aktuell, schrittweiteMeter, peilung);
}

export function bewegeWegVonZiel(
  aktuell: Koordinate,
  gefahr: Koordinate,
  schrittweiteMeter: number
): Koordinate {
  const peilung = (berechnePeilungGrad(gefahr, aktuell) + (Math.random() * 40 - 20) + 360) % 360;
  return bewegeInRichtung(aktuell, schrittweiteMeter, peilung);
}
