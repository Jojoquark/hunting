import { GameRoom } from './GameRoom';
import { handleTransitNearby } from './transit';
import { Konto, normalisiereName, pruefeName, pruefePasswort } from './Konto';

export { GameRoom, Konto };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  KONTO: DurableObjectNamespace;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  FIREBASE_SA?: string;
  QR_SECRET?: string;
  ENVIRONMENT?: string;
}

// Erlaubte Ursprünge für GitHub Pages und lokale Entwicklung
const ERLAUBTE_URSPRUENGE = new Set([
  'https://jojoquark.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173'
]);

const MAX_CODE_VERSUCHE = 5;
const MAX_KLEINER_REQUEST = 1024;

/**
 * Ermittelt die sicheren CORS-Header basierend auf dem anfragenden Origin.
 */
function holeCorsHeader(request: Request): HeadersInit {
  const anfrageUrsprung = request.headers.get('Origin');
  const erlaubterUrsprung = (anfrageUrsprung && ERLAUBTE_URSPRUENGE.has(anfrageUrsprung))
    ? anfrageUrsprung
    : 'https://jojoquark.github.io';

  return {
    'Access-Control-Allow-Origin': erlaubterUrsprung,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade, X-Spieler-ID',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function erzeugeSpielCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(array[i] % chars.length);
  }
  return res;
}

function erzeugeZufallsToken(byteAnzahl = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteAnzahl));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requestBodyZuGross(request: Request): boolean {
  const laenge = request.headers.get('Content-Length');
  return laenge !== null && (!/^\d+$/.test(laenge) || Number(laenge) > MAX_KLEINER_REQUEST);
}

async function hasheWert(wert: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wert));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function begrenzeAnfragen(
  request: Request,
  env: Env,
  limitTyp: string,
  limit: number,
  fensterMs: number
): Promise<Response | null> {
  // Lokale Entwicklung (`pnpm --filter @hunting/worker dev`) testet viele Runden hintereinander.
  if (env.ENVIRONMENT === 'development') return null;
  const ip = request.headers.get('CF-Connecting-IP') || 'lokal';
  const ipHash = await hasheWert(ip);
  const id = env.GAME_ROOM.idFromName(`_limit_${limitTyp}_${ipHash}`);
  const stub = env.GAME_ROOM.get(id);
  const res = await stub.fetch(new Request('https://game-room/_internal/rate-limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, fensterMs })
  }));
  if (res.ok) return null;
  const retryAfter = res.headers.get('Retry-After') || '60';
  const headers = new Headers(holeCorsHeader(request));
  headers.set('Retry-After', retryAfter);
  return new Response('Zu viele Anfragen', {
    status: 429,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = holeCorsHeader(request);

    // OPTIONS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 1. POST /spiele - Neues Spiel und Host-Zugang erstellen
    if (request.method === 'POST' && url.pathname === '/spiele') {
      if (requestBodyZuGross(request)) return new Response('Anfrage zu groß', { status: 413, headers: corsHeaders });
      const rateLimit = await begrenzeAnfragen(request, env, 'spiel-erstellen', 4, 60 * 60 * 1000);
      if (rateLimit) return rateLimit;

      for (let versuch = 0; versuch < MAX_CODE_VERSUCHE; versuch++) {
        const code = erzeugeSpielCode();
        const spielerId = erzeugeZufallsToken(16);
        const token = erzeugeZufallsToken();
        const tokenHash = await hasheWert(token);
        const id = env.GAME_ROOM.idFromName(code);
        const stub = env.GAME_ROOM.get(id);
        const res = await stub.fetch(new Request('https://game-room/_internal/initialisieren', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, hostId: spielerId, spielerId, tokenHash })
        }));

        if (res.status === 409) continue;
        if (!res.ok) return new Response('Spiel konnte nicht erstellt werden', { status: 503, headers: corsHeaders });
        return Response.json({ code, spielerId, token, erzeugt: true }, { headers: corsHeaders });
      }
      return new Response('Kein freier Spielcode verfügbar', { status: 503, headers: corsHeaders });
    }

    // 2. POST /spiele/:code/beitreten - Spieler-Zugang serverseitig ausstellen
    const beitretenMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})\/beitreten$/);
    if (request.method === 'POST' && beitretenMatch) {
      if (requestBodyZuGross(request)) return new Response('Anfrage zu groß', { status: 413, headers: corsHeaders });
      const rateLimit = await begrenzeAnfragen(request, env, 'beitreten', 32, 60 * 1000);
      if (rateLimit) return rateLimit;
      const code = beitretenMatch[1].toUpperCase();
      const spielerId = erzeugeZufallsToken(16);
      const token = erzeugeZufallsToken();
      const tokenHash = await hasheWert(token);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
      const res = await stub.fetch(new Request('https://game-room/_internal/beitreten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spielerId, tokenHash })
      }));
      if (!res.ok) {
        const text = await res.text();
        return new Response(text || 'Beitritt fehlgeschlagen', { status: res.status, headers: corsHeaders });
      }
      return Response.json({ code, spielerId, token }, { headers: corsHeaders });
    }

    // 3. GET /spiele/:code - Spiel prüfen
    const spieleMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})$/);
    if (request.method === 'GET' && spieleMatch) {
      const code = spieleMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      const res = await stub.fetch(request);
      const headers = new Headers(res.headers);
      new Headers(corsHeaders).forEach((wert, schluessel) => headers.set(schluessel, wert));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }

    // 4. GET /spiele/:code/replay - Replay nur für authentifizierte Teilnehmer
    const replayMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})\/replay$/);
    if (request.method === 'GET' && replayMatch) {
      const code = replayMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      const res = await stub.fetch(request);
      const headers = new Headers(res.headers);
      new Headers(corsHeaders).forEach((wert, schluessel) => headers.set(schluessel, wert));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }

    // 5. GET /spiele/:code/ws - Authentifizierter WebSocket
    const wsMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})\/ws$/);
    if (request.method === 'GET' && wsMatch) {
      const origin = request.headers.get('Origin');
      if (origin && !ERLAUBTE_URSPRUENGE.has(origin)) {
        return new Response('Nicht autorisierter Ursprung', { status: 403 });
      }

      const code = wsMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // 6. Konto: registrieren, anmelden, Sitzung prüfen, abmelden (Benutzername + Passwort)
    const kontoMatch = url.pathname.match(/^\/konto\/(registrieren|anmelden|pruefen|abmelden|statistik)$/);
    if (request.method === 'POST' && kontoMatch) {
      if (requestBodyZuGross(request)) return new Response('Anfrage zu groß', { status: 413, headers: corsHeaders });
      const aktion = kontoMatch[1];
      const daten = await request.json().catch(() => ({})) as { name?: unknown; passwort?: unknown; token?: unknown };
      const nameFehler = pruefeName(daten.name);
      if (nameFehler) return new Response(nameFehler, { status: 400, headers: corsHeaders });
      if (aktion === 'registrieren' || aktion === 'anmelden') {
        const passwortFehler = pruefePasswort(daten.passwort);
        if (passwortFehler) return new Response(passwortFehler, { status: 400, headers: corsHeaders });
        const limit = await begrenzeAnfragen(request, env, `konto-${aktion}`, aktion === 'registrieren' ? 5 : 30, 60 * 60 * 1000);
        if (limit) return limit;
      }
      const stub = env.KONTO.get(env.KONTO.idFromName(normalisiereName(daten.name as string)));
      const res = await stub.fetch(new Request(`https://konto/${aktion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: daten.name, passwort: daten.passwort, token: daten.token })
      }));
      const headers = new Headers(res.headers);
      new Headers(corsHeaders).forEach((wert, schluessel) => headers.set(schluessel, wert));
      return new Response(res.body, { status: res.status, headers });
    }

    // 7. GET /transit/nearby?lat=...&lng=...
    if (request.method === 'GET' && url.pathname === '/transit/nearby') {
      const lat = parseFloat(url.searchParams.get('lat') || '0');
      const lng = parseFloat(url.searchParams.get('lng') || '0');
      if (!lat || !lng) {
        return new Response('Fehlende Koordinaten', { status: 400, headers: corsHeaders });
      }

      const daten = await handleTransitNearby(lat, lng);
      return Response.json(daten, { headers: corsHeaders });
    }

    // 8. Push ist deaktiviert, bis eine echte VAPID-Signatur implementiert ist.
    if (request.method === 'POST' && url.pathname === '/push/abo') {
      return new Response('Push-Benachrichtigungen sind derzeit deaktiviert', { status: 501, headers: corsHeaders });
    }

    return new Response('HUNTING Backend API', { status: 200, headers: corsHeaders });
  }
};
