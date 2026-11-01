import { describe, it, expect } from 'vitest';

export async function erzeugeQrToken(
  zielId: string,
  secret: string,
  zeitstempel: number,
  nonce: string
): Promise<string> {
  const enc = new TextEncoder();
  const daten = `${zielId}:${zeitstempel}:${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(daten));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${daten}:${sigHex}`;
}

export async function validiereQrToken(
  tokenString: string,
  secret: string,
  serverZeit: number,
  verbrauchteNonces: Set<string>
): Promise<{ gueltig: boolean; zielId?: string; fehler?: string }> {
  const teile = tokenString.split(':');
  if (teile.length !== 4) return { gueltig: false, fehler: 'TOKEN_FORMAT_UNGUELTIG' };

  const [zielId, zeitStr, nonce, sigHex] = teile;
  const zeitstempel = parseInt(zeitStr, 10);

  if (isNaN(zeitstempel)) return { gueltig: false, fehler: 'ZEITSTEMPEL_UNGUELTIG' };

  if (serverZeit - zeitstempel > 30000) {
    return { gueltig: false, fehler: 'TOKEN_ABGELAUFEN' };
  }
  if (zeitstempel > serverZeit + 5000) {
    return { gueltig: false, fehler: 'TOKEN_IN_ZUKUNFT' };
  }

  if (verbrauchteNonces.has(nonce)) {
    return { gueltig: false, fehler: 'REPLAY_ANGRIFF_NONCE_VERBRAUCHT' };
  }

  const enc = new TextEncoder();
  const daten = `${zielId}:${zeitstempel}:${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = new Uint8Array(
    sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  const istValide = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(daten));
  if (!istValide) {
    return { gueltig: false, fehler: 'SIGNATUR_UNGUELTIG' };
  }

  verbrauchteNonces.add(nonce);
  return { gueltig: true, zielId };
}

describe('Security Audit: QR-Catch Token HMAC & Replay Defense', () => {
  const secret = 'prod-test-secret-32-chars-long-hex!';
  const jetzt = 1730480000000;

  it('Akzeptiert gueltigen Token innerhalb des 30-Sekunden-Fensters', async () => {
    const verbraucht = new Set<string>();
    const token = await erzeugeQrToken('hider42', secret, jetzt, 'nonce-abc-1');
    const res = await validiereQrToken(token, secret, jetzt + 5000, verbraucht);

    expect(res.gueltig).toBe(true);
    expect(res.zielId).toBe('hider42');
    expect(verbraucht.has('nonce-abc-1')).toBe(true);
  });

  it('Verhindert Replay-Attacken mit demselben Token/Nonce', async () => {
    const verbraucht = new Set<string>();
    const token = await erzeugeQrToken('hider42', secret, jetzt, 'nonce-replay');

    const res1 = await validiereQrToken(token, secret, jetzt + 2000, verbraucht);
    expect(res1.gueltig).toBe(true);

    const res2 = await validiereQrToken(token, secret, jetzt + 4000, verbraucht);
    expect(res2.gueltig).toBe(false);
    expect(res2.fehler).toBe('REPLAY_ANGRIFF_NONCE_VERBRAUCHT');
  });

  it('Weist abgelaufene Tokens (> 30s) strikt ab', async () => {
    const verbraucht = new Set<string>();
    const token = await erzeugeQrToken('hider42', secret, jetzt - 31000, 'nonce-expired');
    const res = await validiereQrToken(token, secret, jetzt, verbraucht);

    expect(res.gueltig).toBe(false);
    expect(res.fehler).toBe('TOKEN_ABGELAUFEN');
  });

  it('Erkennt und blockiert manipulierte Ziel-IDs', async () => {
    const verbraucht = new Set<string>();
    const token = await erzeugeQrToken('hider42', secret, jetzt, 'nonce-tamper');
    const gefaelschterToken = token.replace('hider42', 'hider99');

    const res = await validiereQrToken(gefaelschterToken, secret, jetzt, verbraucht);
    expect(res.gueltig).toBe(false);
    expect(res.fehler).toBe('SIGNATUR_UNGUELTIG');
  });
});
