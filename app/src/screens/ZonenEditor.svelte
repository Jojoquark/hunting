<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import GlasKapsel from '../lib/ui/GlasKapsel.svelte';
  import GlasKnopf from '../lib/ui/GlasKnopf.svelte';
  import Icon from '../lib/ui/Icon.svelte';

  interface Props {
    initialMitte?: [number, number]; // [lng, lat]
    initialRadius?: number;           // in Metern
    initialStufen?: number;
    initialFaktor?: number;
    onspeichern?: (daten: { mitte: [number, number]; radius: number; stufen: number; faktor: number }) => void;
    onabbrechen?: () => void;
  }

  let {
    initialMitte = [13.405, 52.52],
    initialRadius = 1000,
    initialStufen = 4,
    initialFaktor = 0.65,
    onspeichern,
    onabbrechen
  }: Props = $props();

  let kartenContainer: HTMLDivElement;
  let karte: maplibregl.Map | null = null;
  let mitteMarker: maplibregl.Marker | null = null;

  let zonenMitte = $state<[number, number]>(initialMitte);
  let radius = $state(initialRadius);
  let stufen = $state(initialStufen);
  let faktor = $state(initialFaktor);
  let aktiveVorschauStufe = $state(1);

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
    koordinaten.push(koordinaten[0]);

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [koordinaten]
      },
      properties: {}
    };
  }

  // Berechnet deterministische Stufenkreise nach §5.3
  function berechneStufenVorschau() {
    const kreise: { stufe: number; mitte: [number, number]; r: number }[] = [];
    let curM = zonenMitte;
    let curR = radius;

    kreise.push({ stufe: 1, mitte: curM, r: curR });

    for (let i = 2; i <= stufen; i++) {
      const nextR = curR * faktor;
      // Deterministischer Versatz zur Demonstration der Schachtelung
      const maxVersatz = (curR - nextR) * 0.7;
      const winkel = (i * 137.5 * Math.PI) / 180; // Goldener Winkel für natürliche Verteilung
      const dx = maxVersatz * Math.sin(winkel);
      const dy = maxVersatz * Math.cos(winkel);

      const deltaLat = dy / 111320;
      const deltaLng = dx / (111320 * Math.cos((curM[1] * Math.PI) / 180));

      const nextM: [number, number] = [curM[0] + deltaLng, curM[1] + deltaLat];
      kreise.push({ stufe: i, mitte: nextM, r: nextR });
      curM = nextM;
      curR = nextR;
    }
    return kreise;
  }

  onMount(() => {
    karte = new maplibregl.Map({
      container: kartenContainer,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: zonenMitte,
      zoom: 14,
      pitch: 0,
      attributionControl: false
    });

    // Ziehbarer Mittelpunkt-Marker
    const el = document.createElement('div');
    el.className = 'zonen-mitte-pin';
    el.innerHTML = '<div class="fadenkreuz"></div>';

    mitteMarker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat(zonenMitte)
      .addTo(karte);

    mitteMarker.on('dragend', () => {
      const lngLat = mitteMarker!.getLngLat();
      zonenMitte = [lngLat.lng, lngLat.lat];
    });

    karte.on('load', () => {
      if (!karte) return;

      // Basis-Zone Source & Layer
      karte.addSource('editor-zone', {
        type: 'geojson',
        data: erzeugeKreisGeoJSON(zonenMitte, radius)
      });

      karte.addLayer({
        id: 'editor-zone-flaeche',
        type: 'fill',
        source: 'editor-zone',
        paint: {
          'fill-color': '#ff5c00',
          'fill-opacity': 0.12
        }
      });

      karte.addLayer({
        id: 'editor-zone-linie',
        type: 'line',
        source: 'editor-zone',
        paint: {
          'line-color': '#ff5c00',
          'line-width': 3
        }
      });

      // Stufen-Vorschau Source
      karte.addSource('editor-stufen', {
        type: 'geojson',
        data: erzeugeStufenGeoJSON()
      });

      karte.addLayer({
        id: 'editor-stufen-linie',
        type: 'line',
        source: 'editor-stufen',
        paint: {
          'line-color': '#ff5c00',
          'line-width': 1.5,
          'line-dasharray': [4, 3],
          'line-opacity': 0.6
        }
      });
    });
  });

  onDestroy(() => {
    mitteMarker?.remove();
    karte?.remove();
  });

  function erzeugeStufenGeoJSON() {
    const stufenKreise = berechneStufenVorschau().slice(1);
    const features = stufenKreise.map(k => erzeugeKreisGeoJSON(k.mitte, k.r));
    return {
      type: 'FeatureCollection' as const,
      features
    };
  }

  $effect(() => {
    if (!karte || !karte.isStyleLoaded()) return;

    const srcZone = karte.getSource('editor-zone') as maplibregl.GeoJSONSource | undefined;
    if (srcZone) {
      srcZone.setData(erzeugeKreisGeoJSON(zonenMitte, radius));
    }

    const srcStufen = karte.getSource('editor-stufen') as maplibregl.GeoJSONSource | undefined;
    if (srcStufen) {
      srcStufen.setData(erzeugeStufenGeoJSON());
    }
  });

  function speichereZone() {
    onspeichern?.({
      mitte: zonenMitte,
      radius,
      stufen,
      faktor
    });
  }
</script>

<div class="zonen-editor">
  <div bind:this={kartenContainer} class="karte-flaeche"></div>

  <!-- Obere Navigations-Kapsel -->
  <header class="editor-header">
    <GlasKapsel variante="kapsel">
      <button class="schliessen-btn" onclick={onabbrechen} aria-label="Abbrechen">
        <Icon name="x" size={18} />
      </button>
      <div class="trennlinie"></div>
      <span class="kopf-text">Zonen-Editor</span>
    </GlasKapsel>
  </header>

  <!-- Untere Schwebende Steuer-Kapsel (Apple Liquid Glass) -->
  <footer class="editor-footer">
    <GlasKapsel variante="panel" klasse="editor-panel">
      <div class="slider-box">
        <div class="slider-header">
          <span class="slider-name">Startradius</span>
          <span class="slider-wert tabular-nums">{radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}</span>
        </div>
        <input type="range" min="150" max="10000" step="50" bind:value={radius} />
      </div>

      <div class="slider-box">
        <div class="slider-header">
          <span class="slider-name">Verkleinerungs-Stufen</span>
          <span class="slider-wert tabular-nums">{stufen} Stufen (je {Math.round(faktor * 100)} %)</span>
        </div>
        <input type="range" min="0" max="8" step="1" bind:value={stufen} />
      </div>

      <div class="hinweis-zeile">
        <Icon name="map-pin" size={14} color="var(--akzent)" />
        <span>Ziehe das Fadenkreuz auf der Karte, um das Zentrum festzulegen.</span>
      </div>

      <div class="aktions-zeile">
        <GlasKnopf variante="primaer" groesse="lg" breit={true} onclick={speichereZone}>
          <Icon name="check" size={20} color="#0a0a0c" />
          <span>Zone festlegen</span>
        </GlasKnopf>
      </div>
    </GlasKapsel>
  </footer>
</div>

<style>
  .zonen-editor {
    position: relative;
    width: 100%;
    height: 100dvh;
    background: var(--grund);
    overflow: hidden;
  }

  .karte-flaeche {
    width: 100%;
    height: 100%;
  }

  .editor-header {
    position: absolute;
    top: max(16px, env(safe-area-inset-top));
    left: 16px;
    z-index: 50;
  }

  .kopf-text {
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 0.9375rem;
    color: var(--tinte);
  }

  .schliessen-btn {
    background: transparent;
    border: none;
    color: var(--tinte);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .trennlinie {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.2);
  }

  .editor-footer {
    position: absolute;
    bottom: max(20px, env(safe-area-inset-bottom));
    left: 16px;
    right: 16px;
    z-index: 50;
    display: flex;
    justify-content: center;
  }

  :global(.editor-panel) {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .slider-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--tinte);
  }

  .slider-wert {
    color: var(--akzent);
    font-weight: 700;
  }

  input[type='range'] {
    accent-color: var(--akzent);
    cursor: pointer;
    height: 6px;
  }

  .hinweis-zeile {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--tinte-2);
  }

  .aktions-zeile {
    margin-top: 4px;
  }

  /* Ziehbares Fadenkreuz für das Zentrum */
  :global(.zonen-mitte-pin) {
    position: relative;
    width: 36px;
    height: 36px;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.zonen-mitte-pin:active) {
    cursor: grabbing;
  }

  :global(.fadenkreuz) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 3px solid var(--akzent);
    background: rgba(255, 92, 0, 0.2);
    box-shadow: 0 0 12px var(--akzent);
  }
  :global(.fadenkreuz::after) {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6px;
    height: 6px;
    background: #ffffff;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
</style>
