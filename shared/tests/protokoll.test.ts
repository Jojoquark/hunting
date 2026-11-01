import { describe, it, expect } from 'vitest';
import {
  parseC2SMessage,
  parseS2CMessage,
  C2SMessageZod
} from '../src/protokoll.js';

describe('Protokoll Zod-Validierung', () => {
  it('parst valide C2S-Nachrichten', () => {
    const hallo = parseC2SMessage({
      typ: 'hallo',
      name: 'AgentX',
      icon: 'star',
      farbe: '#ff5c00'
    });
    expect(hallo.typ).toBe('hallo');

    const ort = parseC2SMessage({
      typ: 'ort',
      lat: 52.5,
      lng: 13.4,
      genauigkeit: 8.5,
      zeit: Date.now()
    });
    expect(ort.typ).toBe('ort');
  });

  it('weist ungültige C2S-Nachrichten ab', () => {
    expect(() =>
      parseC2SMessage({
        typ: 'ort',
        lat: 100, // Invalid: > 90
        lng: 13.4,
        genauigkeit: -5, // Invalid: negativ
        zeit: Date.now()
      })
    ).toThrow();
  });

  it('parst S2C-Sichtbarkeit', () => {
    const sicht = parseS2CMessage({
      typ: 'sicht',
      sichtbarePositionen: [
        {
          spielerId: 'p1',
          name: 'Hunter',
          farbe: '#ff3b5c',
          icon: 'crosshair',
          rolle: 'seeker',
          lat: 52.5,
          lng: 13.4,
          genauigkeit: 5,
          typ: 'live',
          zeitpunkt: Date.now()
        }
      ]
    });
    expect(sicht.typ).toBe('sicht');
  });
});
