<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';
  import { ermittleBasisHttpUrl } from '../lib/netz/config';
  import Karte, { type SpielerMarker, type WegLinie } from '../lib/karte/Karte.svelte';

  interface ReplayDaten {
    modus: 'klassisch' | 'zombie' | 'mrx';
    start: number;
    ende: number;
    spieler: Array<{ id: string; name: string; rolle: string; istBot: boolean }>;
    wege: Record<string, Array<[number, number, number]>>;
    ereignisse: Array<{ zeit: number; typ: string; daten: Record<string, any> }>;
  }

  interface Props {
    spielCode?: string;
    spielerId?: string;
    token?: string;
    onSchliessen?: () => void;
  }

  let { spielCode = '', spielerId = '', token = '', onSchliessen = () => {} }: Props = $props();

  const FARBEN = { jaeger: '#ff3b5c', gejagt: '#3ad1ff', zombie: '#8fe33a' } as const;

  let daten = $state<ReplayDaten | null>(null);
  let fehler = $state('');
  let aktuelleZeitMs = $state(0);
  let istAmAbspielen = $state(false);
  let geschwindigkeit = $state<10 | 30 | 60>(30);
  let animationsFrame: number | null = null;
  let letzterFrameZeitpunkt = 0;

  onMount(async () => {
    try {
      const antwort = await fetch(`${ermittleBasisHttpUrl()}/spiele/${encodeURIComponent(spielCode)}/replay`, {
        headers: { 'X-Spieler-ID': spielerId, Authorization: `Bearer ${token}` }
      });
      if (!antwort.ok) {
        fehler = antwort.status === 401
          ? 'Nur Teilnehmer dieser Runde können das Replay ansehen.'
          : antwort.status === 404
            ? 'Das Replay ist nicht mehr verfügbar. Wege werden 24 Stunden nach Spielende gelöscht.'
            : (await antwort.text()) || 'Replay konnte nicht geladen werden.';
        return;
      }
      daten = await antwort.json();
    } catch {
      fehler = 'Keine Verbindung zum Server.';
    }
  });

  onDestroy(() => {
    if (animationsFrame) cancelAnimationFrame(animationsFrame);
  });

  let dauerMs = $derived(daten ? Math.max(1000, daten.ende - daten.start) : 1);
  let jetzt = $derived(daten ? daten.start + aktuelleZeitMs : 0);
  let namen = $derived(new Map((daten?.spieler ?? []).map((s) => [s.id, s.name])));

  // Zeitpunkt, ab dem ein Spieler gefangen oder ausgeschieden ist
  let fangZeiten = $derived.by(() => {
    const zeiten = new Map<string, number>();
    for (const e of daten?.ereignisse ?? []) {
      if ((e.typ === 'fang' || e.typ === 'ausgeschieden') && !zeiten.has(e.daten.ziel)) zeiten.set(e.daten.ziel, e.zeit);
    }
    return zeiten;
  });

  function teamZu(id: string, rolle: string, zeitpunkt: number): 'jaeger' | 'gejagt' | 'zombie' | null {
    const gefangenUm = fangZeiten.get(id);
    const gefangen = gefangenUm !== undefined && gefangenUm <= zeitpunkt;
    if (daten?.modus === 'zombie') return rolle === 'zombie' && (gefangenUm === undefined || gefangen) ? 'zombie' : 'gejagt';
    if (gefangen) return null; // Gefangene verschwinden von der Karte
    return rolle === 'seeker' || rolle === 'detektiv' ? 'jaeger' : 'gejagt';
  }

  function positionZu(weg: Array<[number, number, number]>, zeitpunkt: number): [number, number] | null {
    if (!weg.length || zeitpunkt < weg[0][0]) return null;
    for (let i = weg.length - 1; i >= 0; i--) {
      if (weg[i][0] <= zeitpunkt) {
        const naechster = weg[i + 1];
        if (!naechster) return [weg[i][2], weg[i][1]];
        const anteil = (zeitpunkt - weg[i][0]) / (naechster[0] - weg[i][0]);
        return [weg[i][2] + (naechster[2] - weg[i][2]) * anteil, weg[i][1] + (naechster[1] - weg[i][1]) * anteil];
      }
    }
    return null;
  }

  let kartenSpieler = $derived.by<SpielerMarker[]>(() => {
    if (!daten) return [];
    const marker: SpielerMarker[] = [];
    for (const sp of daten.spieler) {
      const team = teamZu(sp.id, sp.rolle, jetzt);
      const pos = team ? positionZu(daten.wege[sp.id] ?? [], jetzt) : null;
      if (team && pos) marker.push({ id: sp.id, name: sp.name, rolle: team, lng: pos[0], lat: pos[1] });
    }
    return marker;
  });

  let wege = $derived.by<WegLinie[]>(() => {
    if (!daten) return [];
    return daten.spieler.map((sp) => ({
      id: sp.id,
      farbe: FARBEN[teamZu(sp.id, sp.rolle, jetzt) ?? 'gejagt'],
      punkte: (daten!.wege[sp.id] ?? []).filter((p) => p[0] <= jetzt).map((p) => [p[2], p[1]] as [number, number])
    }));
  });

  let zone = $derived.by(() => {
    const zonen = (daten?.ereignisse ?? []).filter((e) => e.typ === 'zone');
    const aktuell = [...zonen].reverse().find((e) => e.zeit <= jetzt) ?? zonen[0];
    return aktuell ? { mitte: [aktuell.daten.lng, aktuell.daten.lat] as [number, number], radius: aktuell.daten.radius } : undefined;
  });

  // Ereignisliste: Zonenschritte nur bei deutlicher Änderung, damit die Liste lesbar bleibt
  let ereignisListe = $derived.by(() => {
    const liste: Array<{ zeitMs: number; titel: string; typ: string }> = [];
    let letzterRadius = 0;
    for (const e of daten?.ereignisse ?? []) {
      const zeitMs = e.zeit - (daten?.start ?? 0);
      const n = (id: string) => namen.get(id) ?? 'Spieler';
      let titel = '';
      if (e.typ === 'phase') titel = e.daten.phase === 'verstecken' ? 'Runde gestartet' : e.daten.phase === 'jagd' ? 'Die Jagd beginnt' : 'Spielende';
      else if (e.typ === 'fang') titel = `${n(e.daten.faenger)} fängt ${n(e.daten.ziel)}`;
      else if (e.typ === 'ausgeschieden') titel = `${n(e.daten.ziel)} hat die Zone verlassen`;
      else if (e.typ === 'ping') titel = 'Ping';
      else if (e.typ === 'ticket') titel = `Mr. X: ${de.mrx.verkehrsmittel[e.daten.ticket as keyof typeof de.mrx.verkehrsmittel] ?? e.daten.ticket}`;
      else if (e.typ === 'faehigkeit') titel = `${n(e.daten.spieler)}: ${de.faehigkeiten.katalog[e.daten.faehigkeit as keyof typeof de.faehigkeiten.katalog]?.name ?? e.daten.faehigkeit}`;
      else if (e.typ === 'zone') {
        if (letzterRadius && Math.abs(letzterRadius - e.daten.radius) / letzterRadius < 0.1) continue;
        titel = letzterRadius ? `Zone schrumpft auf ${e.daten.radius} m` : `Startzone ${e.daten.radius} m`;
        letzterRadius = e.daten.radius;
      }
      if (titel) liste.push({ zeitMs, titel, typ: e.typ });
    }
    return liste;
  });

  function formatiere(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  function tick(timestamp: number) {
    if (!istAmAbspielen) return;
    if (!letzterFrameZeitpunkt) letzterFrameZeitpunkt = timestamp;
    const deltaMs = timestamp - letzterFrameZeitpunkt;
    letzterFrameZeitpunkt = timestamp;
    aktuelleZeitMs = Math.min(dauerMs, aktuelleZeitMs + deltaMs * geschwindigkeit);
    if (aktuelleZeitMs >= dauerMs) istAmAbspielen = false;
    else animationsFrame = requestAnimationFrame(tick);
  }

  function togglePlay() {
    klang.klick();
    istAmAbspielen = !istAmAbspielen;
    if (istAmAbspielen) {
      if (aktuelleZeitMs >= dauerMs) aktuelleZeitMs = 0;
      letzterFrameZeitpunkt = 0;
      animationsFrame = requestAnimationFrame(tick);
    } else if (animationsFrame) {
      cancelAnimationFrame(animationsFrame);
    }
  }

  function springeZu(zeitMs: number) {
    klang.klick();
    aktuelleZeitMs = Math.min(dauerMs, Math.max(0, zeitMs));
  }
</script>

<div class="replay-screen">
  {#if daten}
    <div class="karten-flaeche">
      <Karte {zone} spieler={kartenSpieler} {wege} interaktiv={true} werkzeuge={false} />
    </div>
  {/if}

  <header class="glas-container kopf-leiste">
    <button type="button" class="zurueck-taste" onclick={() => { klang.klick(); onSchliessen(); }}>
      ← {de.allgemein.zurueck}
    </button>
    <div class="titel">{de.replay.titel}</div>
    <div class="zeit-anzeige tabular-nums">{formatiere(aktuelleZeitMs)} / {formatiere(dauerMs)}</div>
  </header>

  {#if fehler}
    <div class="glas-container hinweis-karte" role="alert">{fehler}</div>
  {:else if !daten}
    <div class="glas-container hinweis-karte" role="status">Replay wird geladen …</div>
  {:else}
    <div class="glas-container ereignis-leiste">
      <div class="ereignis-scroll">
        {#each ereignisListe as e}
          <button
            type="button"
            class="ereignis-punkt typ-{e.typ}"
            class:erreicht={aktuelleZeitMs >= e.zeitMs}
            onclick={() => springeZu(e.zeitMs)}
          >
            <span class="e-zeit tabular-nums">{formatiere(e.zeitMs)}</span>
            <span class="e-titel">{e.titel}</span>
          </button>
        {/each}
      </div>
    </div>

    <footer class="glas-container steuerungs-kapsel">
      <input
        type="range"
        class="zeitleiste-slider"
        min="0"
        max={dauerMs}
        step="1000"
        bind:value={aktuelleZeitMs}
        aria-label="Zeitleiste"
      />
      <div class="kontroll-reihe">
        <button type="button" class="play-taste" onclick={togglePlay}>
          {istAmAbspielen ? de.replay.pause : de.replay.abspielen}
        </button>
        <div class="speed-toggle" role="group" aria-label="Geschwindigkeit">
          {#each [10, 30, 60] as const as speed}
            <button
              type="button"
              class="speed-btn"
              class:aktiv={geschwindigkeit === speed}
              onclick={() => { klang.klick(); geschwindigkeit = speed; }}
            >{speed}×</button>
          {/each}
        </div>
      </div>
    </footer>
  {/if}
</div>

<style>
  .replay-screen {
    position: fixed;
    inset: 0;
    background: var(--grund);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
    z-index: 100;
    pointer-events: none;
  }

  .karten-flaeche {
    position: absolute;
    inset: 0;
    pointer-events: auto;
  }

  .glas-container {
    position: relative;
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.85);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    backdrop-filter: blur(24px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 20px;
    color: var(--tinte);
  }

  .kopf-leiste {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
  }

  .zurueck-taste {
    background: transparent;
    border: none;
    color: var(--akzent);
    font-weight: 700;
    cursor: pointer;
  }

  .titel {
    font-weight: 800;
    font-size: 0.95rem;
  }

  .zeit-anzeige {
    font-size: 0.8rem;
    color: var(--tinte-2);
  }

  .hinweis-karte {
    padding: 16px;
    text-align: center;
    font-size: 0.9rem;
    color: var(--tinte-2);
  }

  .ereignis-leiste {
    padding: 8px;
    margin-top: auto;
  }

  .ereignis-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ereignis-punkt {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 160px;
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #16161b;
    color: var(--tinte-2);
    text-align: left;
    cursor: pointer;
  }

  .ereignis-punkt.erreicht {
    color: var(--tinte);
    border-color: rgba(255, 92, 0, 0.5);
  }

  .ereignis-punkt.typ-fang.erreicht,
  .ereignis-punkt.typ-ausgeschieden.erreicht {
    border-color: var(--rolle-jaeger);
  }

  .e-zeit {
    font-size: 0.7rem;
    color: var(--akzent);
  }

  .e-titel {
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .steuerungs-kapsel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
  }

  .zeitleiste-slider {
    width: 100%;
    accent-color: var(--akzent);
  }

  .kontroll-reihe {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .play-taste {
    flex: 1;
    height: 44px;
    border: none;
    border-radius: 14px;
    background: var(--akzent);
    color: #0a0a0c;
    font-weight: 800;
    cursor: pointer;
  }

  .speed-toggle {
    display: flex;
    gap: 4px;
  }

  .speed-btn {
    height: 44px;
    min-width: 48px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #16161b;
    color: var(--tinte-2);
    font-weight: 700;
    cursor: pointer;
  }

  .speed-btn.aktiv {
    border-color: var(--akzent);
    color: var(--tinte);
  }
</style>
