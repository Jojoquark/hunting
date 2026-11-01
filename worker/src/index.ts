import { GameRoom } from './GameRoom';
import { handleTransitNearby } from './transit';

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  FIREBASE_SA?: string;
  QR_SECRET?: string;
}

// Erlaubte Ursprünge für GitHub Pages und lokale Entwicklung
const ERLAUBTE_URSPRUENGE = new Set([
  'https://jojoquark.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173'
]);

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade',
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = holeCorsHeader(request);

    // OPTIONS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 1. POST /spiele - Neues Spiel erstellen
    if (request.method === 'POST' && url.pathname === '/spiele') {
      const code = erzeugeSpielCode();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);

      return Response.json({ code, erzeugt: true }, { headers: corsHeaders });
    }

    // 2. GET /spiele/:code - Spiel prüfen
    const spieleMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})$/);
    if (spieleMatch) {
      const code = spieleMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      const res = await stub.fetch(request);
      return new Response(res.body, { headers: corsHeaders });
    }

    // 3. GET /spiele/:code/ws - WebSocket (inkl. CSWSH Schutz)
    const wsMatch = url.pathname.match(/^\/spiele\/([A-Za-z0-9]{4,8})\/ws$/);
    if (wsMatch) {
      const origin = request.headers.get('Origin');
      if (origin && !ERLAUBTE_URSPRUENGE.has(origin)) {
        return new Response('Nicht autorisierter Ursprung', { status: 403 });
      }

      const code = wsMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // 4. GET /transit/nearby?lat=...&lng=...
    if (url.pathname === '/transit/nearby') {
      const lat = parseFloat(url.searchParams.get('lat') || '0');
      const lng = parseFloat(url.searchParams.get('lng') || '0');
      if (!lat || !lng) {
        return new Response('Fehlende Koordinaten', { status: 400, headers: corsHeaders });
      }

      const daten = await handleTransitNearby(lat, lng);
      return Response.json(daten, { headers: corsHeaders });
    }

    // 5. POST /push/abo
    if (request.method === 'POST' && url.pathname === '/push/abo') {
      const body = await request.json() as any;
      if (!body.code || !body.spielerId) {
        return new Response('Ungültiges Abo', { status: 400, headers: corsHeaders });
      }
      const id = env.GAME_ROOM.idFromName(body.code.toUpperCase());
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response('HUNTING Backend API', { status: 200, headers: corsHeaders });
  }
};
