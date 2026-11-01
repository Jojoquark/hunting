<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';

  interface ReplayEreignis {
    zeitMs: number;
    typ: 'ping' | 'fang' | 'ticket' | 'zone' | 'faehigkeit';
    titel: string;
    details?: string;
  }

  let {
    spielDauerMs = 1800000, // 30 Minuten
    ereignisse = [
      { zeitMs: 180000, typ: 'ping', titel: 'Erster regulärer Radar-Ping' },
      { zeitMs: 420000, typ: 'ticket', titel: 'Mr. X stieg in Bus 42' },
      { zeitMs: 720000, typ: 'zone', titel: 'Zone schrumpfte auf Stufe 1' },
      { zeitMs: 1120000, typ: 'fang', titel: 'Max fing Alex' },
      { zeitMs: 1540000, typ: 'faehigkeit', titel: 'Radar gezündet' },
    ] as ReplayEreignis[],
    onSchliessen = () => {},
  } = $props<{
    spielDauerMs?: number;
    ereignisse?: ReplayEreignis[];
    onSchliessen?: () => void;
  }>();

  let aktuelleZeitMs = $state(0);
  let istAmAbspielen = $state(false);
  let geschwindigkeit = $state<1 | 10 | 60>(10);
  let animationsFrame: number | null = null;
  let letzterFrameZeitpunkt: number = 0;

  let formatierteAktuelleZeit = $derived.by(() => {
    const s = Math.floor(aktuelleZeitMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  });

  let formatierteGesamtZeit = $derived.by(() => {
    const s = Math.floor(spielDauerMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  });

  function tick(timestamp: number) {
    if (!istAmAbspielen) return;

    if (!letzterFrameZeitpunkt) letzterFrameZeitpunkt = timestamp;
    const deltaMs = timestamp - letzterFrameZeitpunkt;
    letzterFrameZeitpunkt = timestamp;

    aktuelleZeitMs = Math.min(spielDauerMs, aktuelleZeitMs + deltaMs * geschwindigkeit);

    if (aktuelleZeitMs >= spielDauerMs) {
      istAmAbspielen = false;
    } else {
      animationsFrame = requestAnimationFrame(tick);
    }
  }

  function togglePlay() {
    klang.klick();
    istAmAbspielen = !istAmAbspielen;
    if (istAmAbspielen) {
      if (aktuelleZeitMs >= spielDauerMs) aktuelleZeitMs = 0;
      letzterFrameZeitpunkt = 0;
      animationsFrame = requestAnimationFrame(tick);
    } else if (animationsFrame) {
      cancelAnimationFrame(animationsFrame);
    }
  }

  function setGeschwindigkeit(speed: 1 | 10 | 60) {
    klang.klick();
    geschwindigkeit = speed;
  }

  function springeZu(zeitMs: number) {
    klang.klick();
    aktuelleZeitMs = zeitMs;
  }

  onDestroy(() => {
    if (animationsFrame) cancelAnimationFrame(animationsFrame);
  });
</script>

<div class="replay-screen">
  <!-- Obere Navigations-Kapsel -->
  <header class="glas-container kopf-leiste">
    <button type="button" class="zurueck-taste" onclick={() => { klang.klick(); onSchliessen(); }}>
      ← {de.allgemein.zurueck}
    </button>
    <div class="titel">{de.replay.titel}</div>
    <div class="zeit-anzeige">{formatierteAktuelleZeit} / {formatierteGesamtZeit}</div>
  </header>

  <!-- Ereignis-Ticker & Zeitleiste -->
  <div class="glas-container ereignis-leiste">
    <div class="ereignis-scroll">
      {#each ereignisse as e}
        <button
          type="button"
          class="ereignis-punkt"
          class:erreicht={aktuelleZeitMs >= e.zeitMs}
          onclick={() => springeZu(e.zeitMs)}
        >
          <span class="e-zeit">T+{Math.floor(e.zeitMs / 60000)}m</span>
          <span class="e-titel">{e.titel}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Untere Schwebende Steuerungs-Kapsel -->
  <footer class="glas-container steuerungs-kapsel">
    <div class="scrubber-reihe">
      <input
        type="range"
        min="0"
        max={spielDauerMs}
        step="1000"
        bind:value={aktuelleZeitMs}
        class="zeitleiste-slider"
      />
    </div>

    <div class="kontroll-reihe">
      <button
        type="button"
        class="play-taste"
        onclick={togglePlay}
        aria-label={istAmAbspielen ? de.replay.pause : de.replay.abspielen}
      >
        {#if istAmAbspielen}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        {:else}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        {/if}
      </button>

      <div class="speed-toggle">
        {#each ([1, 10, 60] as const) as sp}
          <button
            type="button"
            class="speed-btn"
            class:aktiv={geschwindigkeit === sp}
            onclick={() => setGeschwindigkeit(sp)}
          >
            {sp}x
          </button>
        {/each}
      </div>
    </div>
  </footer>
</div>

<style>
  .replay-screen {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 20px) 16px;
    z-index: 100;
  }

  .glas-container {
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.75);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    backdrop-filter: blur(24px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    border-radius: 24px;
    color: #f2f2ee;
  }

  .kopf-leiste {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    margin-top: 8px;
  }

  .zurueck-taste {
    background: transparent;
    border: none;
    color: #ff5c00;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .titel {
    font-weight: 700;
    font-size: 1rem;
  }

  .zeit-anzeige {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    color: #a3a3ad;
  }

  .ereignis-leiste {
    margin: 12px 0;
    padding: 8px 12px;
  }

  .ereignis-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }

  .ereignis-punkt {
    flex-shrink: 0;
    background: #181820;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 6px 10px;
    color: #a3a3ad;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .ereignis-punkt.erreicht {
    border-color: #ff5c00;
    color: #f2f2ee;
  }

  .e-zeit {
    font-size: 0.65rem;
    color: #ff5c00;
    font-weight: 700;
  }

  .steuerungs-kapsel {
    padding: 16px 20px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .zeitleiste-slider {
    width: 100%;
    accent-color: #ff5c00;
    cursor: pointer;
  }

  .kontroll-reihe {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .play-taste {
    background: #ff5c00;
    color: #000;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s ease-out;
  }

  .play-taste:active {
    transform: scale(0.95);
  }

  .speed-toggle {
    display: flex;
    gap: 6px;
    background: #14141a;
    padding: 4px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .speed-btn {
    background: transparent;
    border: none;
    color: #a3a3ad;
    padding: 6px 12px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .speed-btn.aktiv {
    background: #ff5c00;
    color: #000;
  }
</style>
