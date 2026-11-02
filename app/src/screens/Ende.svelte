<script lang="ts" module>
  export interface Auswertung {
    id: string;
    name: string;
    rolle: string;
    team: 'faenger' | 'gejagt';
    gewonnen: boolean;
    distanzMeter: number;
    faenge: number;
    ueberlebtSekunden: number | null;
    istBot: boolean;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';

  interface Props {
    sieger?: string;
    letzterMensch?: string | null;
    auswertung?: Auswertung[];
    eigeneId?: string;
    onRevanche?: () => void;
    onLobby?: () => void;
    onReplay?: () => void;
  }

  let {
    sieger = 'seeker', // 'seeker' | 'hider' | 'zombies' | 'menschen' | 'mrx' | 'detektive'
    letzterMensch = null as string | null,
    auswertung = [],
    eigeneId = '',
    onRevanche = () => {},
    onLobby = () => {},
    onReplay,
  }: Props = $props();

  // Gewinner zuerst, danach nach Fängen und Strecke
  let tabelle = $derived(
    [...auswertung].sort((a, b) =>
      Number(b.gewonnen) - Number(a.gewonnen) || b.faenge - a.faenge || b.distanzMeter - a.distanzMeter
    )
  );

  function zeit(sekunden: number | null) {
    if (sekunden === null) return '–';
    return `${Math.floor(sekunden / 60)}:${(sekunden % 60).toString().padStart(2, '0')}`;
  }

  function km(meter: number) {
    return meter >= 1000 ? `${(meter / 1000).toFixed(1).replace('.', ',')} km` : `${meter} m`;
  }

  onMount(() => {
    // Erfolgs-Sound & haptisches Feedback
    klang.ticketGong();
  });

  function starteRevanche() {
    klang.klick();
    onRevanche();
  }
</script>

<div class="ende-screen">
  <div class="glas-container ende-karte">
    <div class="pokal-icon">🏆</div>

    <h1 class="sieger-titel">
      {de.ende.sieger[sieger as keyof typeof de.ende.sieger] || de.ende.titel}
    </h1>

    {#if letzterMensch}
      <div class="ehren-kapsel">
        <span class="ehren-stern">⭐</span>
        <span>{de.ende.letzterMensch.replace('%s', letzterMensch)}</span>
      </div>
    {/if}

    {#if tabelle.length > 0}
      <table class="auswertung">
        <thead>
          <tr>
            <th scope="col">Spieler</th>
            <th scope="col">{de.ende.statistiken.gelaufeneDistanz}</th>
            <th scope="col">{de.ende.statistiken.faenge}</th>
            <th scope="col">{de.ende.statistiken.ueberlebteZeit}</th>
          </tr>
        </thead>
        <tbody>
          {#each tabelle as zeile (zeile.id)}
            <tr class:ich={zeile.id === eigeneId}>
              <td>
                <span class="team-punkt team-{zeile.team}"></span>
                <span class="zeilen-name">{zeile.name}{zeile.id === eigeneId ? ' (Du)' : ''}</span>
                {#if zeile.gewonnen}<span class="sieg-marke">Sieg</span>{/if}
              </td>
              <td class="tabular-nums">{km(zeile.distanzMeter)}</td>
              <td class="tabular-nums">{zeile.faenge}</td>
              <td class="tabular-nums">{zeit(zeile.ueberlebtSekunden)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <!-- AKTIONEN -->
    <div class="aktions-leiste">
      {#if onReplay}
        <button type="button" class="replay-taste" onclick={() => { klang.klick(); onReplay?.(); }}>
          {de.ende.aktionen.replay}
        </button>
      {/if}
      <button type="button" class="sekundaer-taste" onclick={starteRevanche}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
        </svg>
        <span>{de.ende.aktionen.revanche}</span>
      </button>

      <button type="button" class="text-link" onclick={() => { klang.klick(); onLobby(); }}>
        {de.ende.aktionen.lobby}
      </button>
    </div>
  </div>
</div>

<style>
  .ende-screen {
    position: fixed;
    inset: 0;
    background: #0a0a0c;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 100;
    overflow-y: auto;
  }

  .glas-container {
    background: rgba(20, 20, 24, 0.85);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    border-radius: 32px;
    color: #f2f2ee;
  }

  .ende-karte {
    max-width: 440px;
    width: 100%;
    padding: 36px 24px;
    text-align: center;
  }

  .pokal-icon {
    font-size: 3.2rem;
    line-height: 1;
    margin-bottom: 12px;
  }

  .sieger-titel {
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f2f2ee;
    margin: 0 0 16px 0;
    line-height: 1.25;
  }

  .ehren-kapsel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 92, 0, 0.15);
    border: 1px solid rgba(255, 92, 0, 0.4);
    color: #ff5c00;
    padding: 6px 14px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.85rem;
    margin-bottom: 24px;
  }

  .aktions-leiste {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sekundaer-taste {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px;
    border-radius: 16px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: transform 0.1s ease-out;
  }

  .sekundaer-taste:active {
    transform: scale(0.97);
  }

  .sekundaer-taste {
    background: #1e1e26;
    color: #f2f2ee;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .text-link {
    background: transparent;
    border: none;
    color: #a3a3ad;
    font-size: 0.85rem;
    margin-top: 6px;
    cursor: pointer;
  }
  .auswertung {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    margin: 4px 0 8px;
  }

  .auswertung th {
    text-align: left;
    font-size: 0.68rem;
    font-weight: 700;
    color: #a3a3ad;
    padding: 0 4px 6px;
  }

  .auswertung td {
    padding: 7px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #f2f2ee;
    white-space: nowrap;
  }

  .auswertung td:first-child {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .auswertung tr.ich td {
    background: rgba(255, 92, 0, 0.08);
  }

  .team-punkt {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }

  .team-faenger { background: var(--rolle-jaeger); }
  .team-gejagt { background: var(--rolle-gejagt); }

  .sieg-marke {
    margin-left: 6px;
    font-size: 0.65rem;
    font-weight: 800;
    color: #ff5c00;
  }

  .replay-taste {
    width: 100%;
    height: 50px;
    border: none;
    border-radius: 16px;
    background: #ff5c00;
    color: #0a0a0c;
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
  }
</style>
