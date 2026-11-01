export interface Haltestelle {
  id: string;
  name: string;
  distanzMeter: number;
  verkehrsmittel: string[];
  lat: number;
  lng: number;
}

export async function handleTransitNearby(
  lat: number,
  lng: number,
  cacheTtlSekunden = 86400
): Promise<Haltestelle[]> {
  // 200m-Raster-Geohash / Kachel berechnen (~0.002 Grad)
  const tileLat = (Math.round(lat * 500) / 500).toFixed(3);
  const tileLng = (Math.round(lng * 500) / 500).toFixed(3);
  const cacheKeyUrl = `https://transit.internal/nearby?tile=${tileLat}_${tileLng}`;

  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKeyUrl);
  if (cachedResponse) {
    return cachedResponse.json();
  }

  let haltestellen: Haltestelle[] = [];

  // 1. Primär: transport.rest
  try {
    const url = `https://v6.db.transport.rest/stops/nearby?latitude=${lat}&longitude=${lng}&distance=1000&results=15`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Hunting-App/1.0 (info@hunting.app)' }
    });

    if (res.ok) {
      const data = await res.json() as any[];
      haltestellen = data.map((item) => ({
        id: item.id || String(item.name),
        name: item.name || 'Unbekannte Haltestelle',
        distanzMeter: Math.round(item.distance || 0),
        verkehrsmittel: bestimmeVerkehrsmittel(item.products),
        lat: item.location?.latitude || lat,
        lng: item.location?.longitude || lng
      }));
    } else {
      throw new Error(`transport.rest antwortete mit HTTP ${res.status}`);
    }
  } catch (err) {
    // 2. Fallback: OpenStreetMap Overpass API
    haltestellen = await overpassTransitFallback(lat, lng);
  }

  // Im Cache ablegen
  const responseToCache = new Response(JSON.stringify(haltestellen), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheTtlSekunden}`
    }
  });

  await cache.put(cacheKeyUrl, responseToCache);
  return haltestellen;
}

function bestimmeVerkehrsmittel(products: Record<string, boolean> | undefined): string[] {
  if (!products) return ['bus'];
  const res: string[] = [];
  if (products.suburban) res.push('sbahn');
  if (products.subway) res.push('ubahn');
  if (products.tram) res.push('tram');
  if (products.bus) res.push('bus');
  if (products.ferry) res.push('faehre');
  if (products.national || products.regional) res.push('zug');
  return res.length > 0 ? res : ['bus'];
}

async function overpassTransitFallback(lat: number, lng: number): Promise<Haltestelle[]> {
  try {
    const query = `
      [out:json][timeout:5];
      (
        node["highway"="bus_stop"](around:800,${lat},${lng});
        node["railway"~"tram_stop|station|halt"](around:800,${lat},${lng});
      );
      out body 15;
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'User-Agent': 'Hunting-App/1.0' }
    });

    if (!res.ok) return [];

    const data = await res.json() as { elements?: any[] };
    return (data.elements || []).map((el) => {
      const isTram = el.tags?.railway === 'tram_stop';
      const isTrain = el.tags?.railway === 'station' || el.tags?.railway === 'halt';
      const isBus = el.tags?.highway === 'bus_stop';

      const v: string[] = [];
      if (isTram) v.push('tram');
      if (isTrain) v.push('zug');
      if (isBus) v.push('bus');

      return {
        id: String(el.id),
        name: el.tags?.name || 'Haltestelle',
        distanzMeter: 0,
        verkehrsmittel: v.length > 0 ? v : ['bus'],
        lat: el.lat,
        lng: el.lon
      };
    });
  } catch {
    return [];
  }
}
