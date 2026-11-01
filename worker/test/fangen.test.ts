import { describe, it, expect } from 'vitest';
import { haversineDistanz } from '../src/geo';

describe('Fangmechanik & GPS-Toleranz', () => {
  it('Berechnet Haversine Distanz akkurat', () => {
    // 52.5200, 13.4050 nach 52.5202, 13.4050 (ca. 22 Meter)
    const p1 = { lat: 52.5200, lng: 13.4050 };
    const p2 = { lat: 52.5202, lng: 13.4050 };
    const dist = haversineDistanz(p1, p2);
    expect(dist).toBeGreaterThan(20);
    expect(dist).toBeLessThan(25);
  });
});
