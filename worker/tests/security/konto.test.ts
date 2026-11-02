import { describe, expect, it } from 'vitest';
import { hashePasswort, normalisiereName, pruefeName, pruefePasswort } from '../../src/Konto';

describe('Konto mit Benutzername und Passwort', () => {
  it('prüft Benutzernamen', () => {
    expect(pruefeName('Jo')).not.toBeNull();
    expect(pruefeName('jäger_01')).toBeNull();
    expect(pruefeName('a b c')).not.toBeNull();
    expect(pruefeName('x'.repeat(21))).not.toBeNull();
    expect(normalisiereName('  Jäger_01 ')).toBe('jäger_01');
  });

  it('verlangt mindestens 8 Zeichen Passwort', () => {
    expect(pruefePasswort('kurz')).not.toBeNull();
    expect(pruefePasswort('lang-genug')).toBeNull();
  });

  it('hasht deterministisch pro Salt und unterschiedlich je Salt', async () => {
    const a = await hashePasswort('geheim123', 'aa'.repeat(16), 1000);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashePasswort('geheim123', 'aa'.repeat(16), 1000)).toBe(a);
    expect(await hashePasswort('geheim123', 'bb'.repeat(16), 1000)).not.toBe(a);
    expect(await hashePasswort('geheim124', 'aa'.repeat(16), 1000)).not.toBe(a);
  });
});
