import { describe, it, expect } from 'vitest';
import {
  FAEHIGKEITEN_KATALOG,
  passtRolleZuFaehigkeit,
  hatGenugEnergie
} from '../src/faehigkeiten.js';

describe('Fähigkeitenkatalog & Regel-Integrität', () => {
  it('enthält exakt 10 definierte Fähigkeiten', () => {
    expect(Object.keys(FAEHIGKEITEN_KATALOG).length).toBe(10);
  });

  it('ordnet Fähigkeiten korrekt den Seiten zu', () => {
    expect(passtRolleZuFaehigkeit('hider', 'tarnkappe')).toBe(true);
    expect(passtRolleZuFaehigkeit('mensch', 'radar')).toBe(true);
    expect(passtRolleZuFaehigkeit('mrx', 'schild')).toBe(true);

    expect(passtRolleZuFaehigkeit('seeker', 'sonderping')).toBe(true);
    expect(passtRolleZuFaehigkeit('zombie', 'sonar')).toBe(true);
    expect(passtRolleZuFaehigkeit('detektiv', 'peilung')).toBe(true);

    // Falsche Zuordnungen abweisen
    expect(passtRolleZuFaehigkeit('hider', 'sonderping')).toBe(false);
    expect(passtRolleZuFaehigkeit('seeker', 'tarnkappe')).toBe(false);
    expect(passtRolleZuFaehigkeit('zuschauer', 'radar')).toBe(false);
  });

  it('prüft Energiekosten korrekt', () => {
    expect(hatGenugEnergie(60, 'tarnkappe')).toBe(true);
    expect(hatGenugEnergie(59, 'tarnkappe')).toBe(false);
  });
});
