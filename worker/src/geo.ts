import { Koordinate, Position } from './types';

const ERDRADIUS_METER = 6371000;

export function haversineDistanz(p1: Koordinate, p2: Koordinate): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return ERDRADIUS_METER * c;
}

export function peilungGrad(von: Koordinate, zu: Koordinate): number {
  const lat1 = (von.lat * Math.PI) / 180;
  const lat2 = (zu.lat * Math.PI) / 180;
  const dLng = ((zu.lng - von.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function istInKreis(punkt: Koordinate, zentrum: Koordinate, radiusMeter: number): boolean {
  return haversineDistanz(punkt, zentrum) <= radiusMeter;
}

/**
 * 50-Meter-Unschärfe für Zombies:
 * Runder 50m-Rasterversatz kombiniert mit einem deterministischen Pseudo-Zufallsoffset
 * pro Minute, sodass Triangulation über wiederholte GPS-Updates unmöglich ist.
 */
export function zombieUnschaerfe(pos: Position, jetztMs: number, salt = 'hunting-zombie'): Koordinate {
  // ca. 111.111 Meter pro Breitengrad; 1 m = ~0.000009 Grad
  const meterToLat = 1 / 111111;
  const meterToLng = 1 / (111111 * Math.cos((pos.lat * Math.PI) / 180));

  const raster50mLat = 50 * meterToLat;
  const raster50mLng = 50 * meterToLng;

  // 1. Auf 50m Raster runden
  const basisLat = Math.round(pos.lat / raster50mLat) * raster50mLat;
  const basisLng = Math.round(pos.lng / raster50mLng) * raster50mLng;

  // 2. Deterministischer Minuten-Offset
  const minutenSlot = Math.floor(jetztMs / 60000);
  const seedString = `${salt}:${minutenSlot}:${basisLat.toFixed(4)}:${basisLng.toFixed(4)}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }

  // Offset [-20m, +20m]
  const offsetLatM = (((hash & 0xff) / 255) - 0.5) * 40;
  const offsetLngM = ((((hash >> 8) & 0xff) / 255) - 0.5) * 40;

  return {
    lat: basisLat + offsetLatM * meterToLat,
    lng: basisLng + offsetLngM * meterToLng
  };
}

export function zufaelligerPunktInKreis(zentrum: Koordinate, radiusMeter: number): Koordinate {
  const r = radiusMeter * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;

  const dx = r * Math.cos(theta);
  const dy = r * Math.sin(theta);

  const deltaLat = dy / 111111;
  const deltaLng = dx / (111111 * Math.cos((zentrum.lat * Math.PI) / 180));

  return {
    lat: zentrum.lat + deltaLat,
    lng: zentrum.lng + deltaLng
  };
}
