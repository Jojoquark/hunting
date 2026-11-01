export interface Koordinate {
  lat: number;
  lng: number;
}

export const ERDRADIUS_METER = 6371000;

export function gradZuBogen(grad: number): number {
  return (grad * Math.PI) / 180;
}

export function bogenZuGrad(bogen: number): number {
  return (bogen * 180) / Math.PI;
}

/**
 * Exakte Haversine-Distanzberechnung in Metern.
 */
export function haversineDistanz(p1: Koordinate, p2: Koordinate): number {
  const dLat = gradZuBogen(p2.lat - p1.lat);
  const dLng = gradZuBogen(p2.lng - p1.lng);
  const lat1 = gradZuBogen(p1.lat);
  const lat2 = gradZuBogen(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return ERDRADIUS_METER * c;
}

/**
 * Berechnet den initialen Peilungswinkel (Bearing) von Punkt 1 zu Punkt 2 in Grad (0..360°).
 */
export function peilungsWinkel(von: Koordinate, nach: Koordinate): number {
  const lat1 = gradZuBogen(von.lat);
  const lat2 = gradZuBogen(nach.lat);
  const dLng = gradZuBogen(nach.lng - von.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bogen = Math.atan2(y, x);
  const grad = bogenZuGrad(bogen);
  return (grad + 360) % 360;
}

/**
 * Prüft, ob ein Punkt innerhalb eines Kreises mit gegebenem Radius liegt.
 */
export function istPunktInKreis(
  punkt: Koordinate,
  mittelpunkt: Koordinate,
  radiusMeter: number
): boolean {
  return haversineDistanz(punkt, mittelpunkt) <= radiusMeter;
}

/**
 * Berechnet einen geodätischen Zielpunkt ausgehend von einem Startpunkt,
 * einer Distanz in Metern und einem Peilungswinkel in Grad.
 */
export function zielPunkt(
  start: Koordinate,
  distanzMeter: number,
  peilungGrad: number
): Koordinate {
  const delta = distanzMeter / ERDRADIUS_METER;
  const theta = gradZuBogen(peilungGrad);
  const phi1 = gradZuBogen(start.lat);
  const lambda1 = gradZuBogen(start.lng);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  let zielLng = bogenZuGrad(lambda2);
  zielLng = ((zielLng + 540) % 360) - 180;

  return {
    lat: bogenZuGrad(phi2),
    lng: zielLng
  };
}

export interface GpsMessung extends Koordinate {
  zeit: number; // Millisekunden
  genauigkeit?: number;
}

/**
 * Prüft zwei aufeinanderfolgende GPS-Messungen auf Plausibilität.
 * Geschwindigkeiten über 50 m/s (180 km/h) gelten als unplausibler Sprung.
 */
export function istGpsPlausibel(
  vorherige: GpsMessung,
  aktuelle: GpsMessung,
  maxGeschwindigkeitMeterProSekunde = 50
): { plausibel: boolean; geschwindigkeitMeterProSekunde: number } {
  const zeitDifferenzSekunden = (aktuelle.zeit - vorherige.zeit) / 1000;
  if (zeitDifferenzSekunden <= 0) {
    const distanz = haversineDistanz(vorherige, aktuelle);
    return {
      plausibel: distanz < 1,
      geschwindigkeitMeterProSekunde: 0
    };
  }

  const distanz = haversineDistanz(vorherige, aktuelle);
  const geschwindigkeit = distanz / zeitDifferenzSekunden;
  return {
    plausibel: geschwindigkeit <= maxGeschwindigkeitMeterProSekunde,
    geschwindigkeitMeterProSekunde: geschwindigkeit
  };
}

function hashStringUndZahl(str: string, zahl: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= zahl;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

function pseudoZufall(seed: number): number {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Koordinaten-Unschärfefunktion für Zombies:
 * 50m-Rasterung + deterministischer stabiler Versatz pro Minute,
 * sodass mehrere Updates innerhalb einer Minute stabil bleiben
 * und keine Mittelung/Trilateration erlauben.
 */
export function unschaerfeZombie(
  position: Koordinate,
  zombieId: string,
  zeitMs: number,
  rasterGroesseMeter = 50
): Koordinate {
  const meterProGradLat = 111195;
  const meterProGradLng = 111195 * Math.cos(gradZuBogen(position.lat));

  const rasterLat = rasterGroesseMeter / meterProGradLat;
  const rasterLng = rasterGroesseMeter / Math.max(1, Math.abs(meterProGradLng));

  const gerastertLat = Math.round(position.lat / rasterLat) * rasterLat;
  const gerastertLng = Math.round(position.lng / rasterLng) * rasterLng;

  const minutenEpoche = Math.floor(zeitMs / 60000);
  const seed1 = hashStringUndZahl(zombieId, minutenEpoche);
  const seed2 = hashStringUndZahl(zombieId, minutenEpoche + 1337);

  const zufallsWinkel = pseudoZufall(seed1) * 360;
  const zufallsDistanz = 15 + pseudoZufall(seed2) * 20; // 15m .. 35m

  return zielPunkt(
    { lat: gerastertLat, lng: gerastertLng },
    zufallsDistanz,
    zufallsWinkel
  );
}
