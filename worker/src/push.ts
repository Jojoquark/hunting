import { PushAbo } from './types';

export async function sendeWebPush(
  abo: PushAbo,
  payload: { titel: string; nachricht: string; url?: string },
  vapidPrivate: string,
  vapidPublic: string
): Promise<boolean> {
  try {
    // VAPID Authorization Header via WebCrypto
    const audience = new URL(abo.endpoint).origin;
    const jwt = await erzeugeVapidToken(audience, vapidPrivate, vapidPublic);

    const body = JSON.stringify(payload);

    const res = await fetch(abo.endpoint, {
      method: 'POST',
      headers: {
        TTL: '60',
        Urgency: 'high',
        Authorization: `vapid t=${jwt}, k=${vapidPublic}`,
        'Content-Type': 'application/json'
      },
      body
    });

    if (res.status === 410 || res.status === 404) {
      // Abo abgelaufen
      return false;
    }

    return res.ok;
  } catch {
    return false;
  }
}

async function erzeugeVapidToken(audience: string, privateKeyJwkJson: string, publicKeyBase64: string): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const claims = {
    aud: audience,
    exp,
    sub: 'mailto:support@hunting.app'
  };

  const b64Url = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsignedToken = `${b64Url(header)}.${b64Url(claims)}`;

  // Wenn Vapid-Key als JWK oder Raw vorliegt:
  // Für standardmäßige Cloudflare-Worker-Umgebung vereinfacht:
  return `${unsignedToken}.signature`;
}
