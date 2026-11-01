<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import GlasKapsel from '../ui/GlasKapsel.svelte';
  import Icon from '../ui/Icon.svelte';

  export interface SpielerMarker {
    id: string;
    name: string;
    rolle: 'jaeger' | 'gejagt' | 'zombie';
    lat: number;
    lng: number;
    unscharf?: boolean;
    signalVerloren?: boolean;
  }

  export interface ZoneDaten {
    mitte: [number, number]; // [lng, lat]
    radius: number;          // in Metern
    naechsteMitte?: [number, number];
    naechsterRadius?: number;
    vorschauAktiv?: boolean;
  }

  export interface PingMarker {
    id: string;
    lat: number;
    lng: number;
    zeitpunkt: number;
  }

  export interface LootMarker {
    id: string;
    lat: number;
    lng: number;
    wert: number;
  }

  interface Props {
    zentrum?: [number, number]; // [lng, lat]
    zoom?: number;
    zone?: ZoneDaten;
    spieler?: SpielerMarker[];
    pings?: PingMarker[];
    loot?: LootMarker[];
    eigenePosition?: { lat: number; lng: number; genauigkeit: number } | null;
    interaktiv?: boolean;
    onklick?: (coords: [number, number]) => void;
  }

  let {
    zentrum = [13.405, 52.52], // Berlin Standard
    zoom = 15,
    zone,
    spieler = [],
    pings = [],
    loot = [],
    eigenePosition = null,
    interaktiv = true,
    onklick
  }: Props = $props();

  let kartenContainer: HTMLDivElement;
  let karte: maplibregl.Map | null = null;
  let spielerMarkers: Map<string, maplibregl.Marker> = new Map();
  let pingMarkers: Map<string, maplibregl.Marker> = new Map();
  let lootMarkers: Map<string, maplibregl.Marker> = new Map();
  let eigenMarker: maplibregl.Marker | null = null;

  // Erzeugt einen GeoJSON-Polygon-Kreis (64 Punkte) für Zonen
  function erzeugeKreisGeoJSON(mitte: [number, number], radiusMeter: number) {
    const punkte = 64;
    const koordinaten: [number, number][] = [];
    const [lng, lat] = mitte;

    for (let i = 0; i < punkte; i++) {
      const winkel = (i * 360) / punkte;
      const rad = (winkel * Math.PI) / 180;
      const dx = radiusMeter * Math.sin(rad);
      const dy = radiusMeter * Math.cos(rad);

      const deltaLat = dy / 111320;
      const deltaLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));

      koordinaten.push([lng + deltaLng, lat + deltaLat]);
    }
    koordinaten.push(koordinaten[0]); // Ring schließen

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [koordinaten]
      },
      properties: {}
    };
  }

  onMount(() => {
    // MapLibre mit dem offiziellen OpenFreeMap Dark Vector Style
    karte = new maplibregl.Map({
      container: kartenContainer,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: zentrum,
      zoom: zoom,
      pitch: 25,
      bearing: 0,
      interactive: interaktiv,
      attributionControl: false
    });

    karte.on('load', () => {
      if (!karte) return;

      // Zonen-Quellen und -Ebenen registrieren
      karte.addSource('zone-aktuell', {
        type: 'geojson',
        data: zone ? erzeugeKreisGeoJSON(zone.mitte, zone.radius) : { type: 'FeatureCollection', features: [] }
      });

      // Zonenfüllung (sehr dezent, damit Straßen lesbar bleiben)
      karte.addLayer({
        id: 'zone-aktuell-flaeche',
        type: 'fill',
        source: 'zone-aktuell',
        paint: {
          'fill-color': '#ff5c00',
          'fill-opacity': 0.07
        }
      });

      // Zonenlinie (feste Signal-Orange-Lichtlinie)
      karte.addLayer({
        id: 'zone-aktuell-linie',
        type: 'line',
        source: 'zone-aktuell',
        paint: {
          'line-color': '#ff5c00',
          'line-width': 2.5,
          'line-opacity': 0.95
        }
      });

      // Nächste Zonenstufe (gestrichelte Vorwarnung)
      karte.addSource('zone-naechste', {
        type: 'geojson',
        data: zone?.vorschauAktiv && zone.naechsteMitte && zone.naechsterRadius
          ? erzeugeKreisGeoJSON(zone.naechsteMitte, zone.naechsterRadius)
          : { type: 'FeatureCollection', features: [] }
      });

      karte.addLayer({
        id: 'zone-naechste-linie',
        type: 'line',
        source: 'zone-naechste',
        paint: {
          'line-color': '#ff5c00',
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.85
        }
      });

      aktualisiereMarker();
    });

    karte.on('click', (e) => {
      onklick?.([e.lngLat.lng, e.lngLat.lat]);
    });
  });

  onDestroy(() => {
    spielerMarkers.forEach(m => m.remove());
    pingMarkers.forEach(m => m.remove());
    lootMarkers.forEach(m => m.remove());
    eigenMarker?.remove();
    karte?.remove();
  });

  // Reaktivität bei Zonen-Änderungen
  $effect(() => {
    if (!karte || !karte.isStyleLoaded()) return;

    const sourceAktuell = karte.getSource('zone-aktuell') as maplibregl.GeoJSONSource | undefined;
    if (sourceAktuell && zone) {
      sourceAktuell.setData(erzeugeKreisGeoJSON(zone.mitte, zone.radius));
    }

    const sourceNaechste = karte.getSource('zone-naechste') as maplibregl.GeoJSONSource | undefined;
    if (sourceNaechste) {
      if (zone?.vorschauAktiv && zone.naechsteMitte && zone.naechsterRadius) {
        sourceNaechste.setData(erzeugeKreisGeoJSON(zone.naechsteMitte, zone.naechsterRadius));
      } else {
        sourceNaechste.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  });

  // Reaktivität für Marker
  $effect(() => {
    if (karte && karte.isStyleLoaded()) {
      aktualisiereMarker();
    }
  });

  function erstelleMarkerElement(s: SpielerMarker): HTMLElement {
    const el = document.createElement('div');
    el.className = `spieler-pin pin-${s.rolle} ${s.unscharf ? 'ist-unscharf' : ''}`;
    
    const kern = document.createElement('div');
    kern.className = 'pin-kern';
    el.appendChild(kern);

    if (s.name) {
      const label = document.createElement('span');
      label.className = 'pin-label';
      label.innerText = s.name;
      el.appendChild(label);
    }
    return el;
  }

  function aktualisiereMarker() {
    if (!karte) return;

    // 1. Eigener Standort
    if (eigenePosition) {
      if (!eigenMarker) {
        const el = document.createElement('div');
        el.className = 'eigener-standort-pin';
        el.innerHTML = '<div class="eigen-puls"></div><div class="eigen-kern"></div>';
        eigenMarker = new maplibregl.Marker({ element: el })
          .setLngLat([eigenePosition.lng, eigenePosition.lat])
          .addTo(karte);
      } else {
        eigenMarker.setLngLat([eigenePosition.lng, eigenePosition.lat]);
      }
    }

    // 2. Spieler
    const aktuelleIds = new Set(spieler.map(s => s.id));
    // Entferne alte
    spielerMarkers.forEach((m, id) => {
      if (!aktuelleIds.has(id)) {
        m.remove();
        spielerMarkers.delete(id);
      }
    });
    // Aktualisiere/Erstelle neue
    spieler.forEach(s => {
      const bestehend = spielerMarkers.get(s.id);
      if (bestehend) {
        bestehend.setLngLat([s.lng, s.lat]);
      } else {
        const el = erstelleMarkerElement(s);
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .addTo(karte!);
        spielerMarkers.set(s.id, m);
      }
    });

    // 3. Pings
    const pingIds = new Set(pings.map(p => p.id));
    pingMarkers.forEach((m, id) => {
      if (!pingIds.has(id)) {
        m.remove();
        pingMarkers.delete(id);
      }
    });
    pings.forEach(p => {
      if (!pingMarkers.has(p.id)) {
        const el = document.createElement('div');
        el.className = 'ping-karten-pin';
        el.innerHTML = '<div class="ping-welle"></div><div class="ping-punkt"></div>';
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .addTo(karte!);
        pingMarkers.set(p.id, m);
      }
    });
  }

  function zentriereAufEigen() {
    if (karte && eigenePosition) {
      karte.flyTo({
        center: [eigenePosition.lng, eigenePosition.lat],
        zoom: 16,
        speed: 1.4,
        curve: 1
      });
    }
  }

  function nordeKarte() {
    if (karte) {
      karte.easeTo({ bearing: 0, pitch: 0 });
    }
  }
</script>

<div class="karten-wrapper">
  <div bind:this={kartenContainer} class="maplibre-container"></div>

  <!-- Schwebende Navigationskapsel (Apple Liquid Glass) -->
  <div class="karten-werkzeuge">
    <GlasKapsel variante="kapsel">
      <button class="werkzeug-knopf" onclick={zentriereAufEigen} aria-label="Eigener Standort">
        <Icon name="locate" size={18} />
      </button>
      <div class="trenner"></div>
      <button class="werkzeug-knopf" onclick={nordeKarte} aria-label="Nach Norden ausrichten">
        <Icon name="compass" size={18} />
      </button>
    </GlasKapsel>
  </div>
</div>

<style>
  .karten-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--grund);
  }

  .maplibre-container {
    width: 100%;
    height: 100%;
  }

  .karten-werkzeuge {
    position: absolute;
    top: calc(env(safe-area-inset-top, 16px) + 16px);
    right: 16px;
    z-index: 50;
  }

  .werkzeug-knopf {
    background: transparent;
    border: none;
    color: var(--tinte);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 50%;
    transition: transform var(--zeit-schnell) var(--feder-aus), color var(--zeit-schnell) ease-out;
  }
  .werkzeug-knopf:active {
    transform: scale(0.9);
  }

  .trenner {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.16);
  }

  /* Globale Marker-Styles für MapLibre-DOM-Nodes */
  :global(.spieler-pin) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
  }

  :global(.pin-kern) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  :global(.pin-jaeger .pin-kern) {
    background: var(--rolle-jaeger);
    border-radius: 2px; /* Raute */
    transform: rotate(45deg);
  }

  :global(.pin-gejagt .pin-kern) {
    background: var(--rolle-gejagt);
    border-radius: 50%;
  }

  :global(.pin-zombie .pin-kern) {
    background: var(--rolle-zombie);
    border-radius: 4px;
  }

  :global(.pin-label) {
    margin-top: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--tinte);
    background: rgba(10, 10, 12, 0.85);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    white-space: nowrap;
  }

  :global(.eigener-standort-pin) {
    position: relative;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.eigen-kern) {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--akzent);
    box-shadow: 0 0 12px var(--akzent);
  }

  :global(.eigen-puls) {
    position: absolute;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 92, 0, 0.25);
    animation: eigenPulsWelle 2s infinite ease-out;
  }

  @keyframes eigenPulsWelle {
    0% { transform: scale(0.6); opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0; }
  }

  :global(.ping-karten-pin) {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.ping-punkt) {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--akzent);
  }

  :global(.ping-welle) {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--akzent);
    animation: pingWelle 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }

  @keyframes pingWelle {
    0% { transform: scale(0.2); opacity: 0.9; }
    100% { transform: scale(2.4); opacity: 0; }
  }
</style>
