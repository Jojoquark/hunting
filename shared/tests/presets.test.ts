import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  validiereEinstellungen,
  standardPreset,
  schnellPreset,
  stadtjagdPreset
} from '../src/presets.js';

describe('Presets und Wertebereiche', () => {
  it('alle Presets erfüllen die Wertebereichs-Validierung', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const { gueltig, fehler } = validiereEinstellungen(preset);
      expect(fehler, `Preset ${name} fehlerhaft`).toEqual([]);
      expect(gueltig).toBe(true);
    }
  });

  it('erkennt ungültige Einstellungen zuverlässig', () => {
    const ungueltig = {
      ...standardPreset,
      versteckZeitMinuten: 70, // Zu lang
      zonenRadiusMeter: 50 // Unter Minimum 150m
    };
    const { gueltig, fehler } = validiereEinstellungen(ungueltig);
    expect(gueltig).toBe(false);
    expect(fehler.length).toBeGreaterThan(0);
  });
});
