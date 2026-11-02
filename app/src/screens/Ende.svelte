<script lang="ts">
  import { onMount } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';

  interface Props {
    sieger?: string;
    letzterMensch?: string | null;
    onRevanche?: () => void;
    onLobby?: () => void;
  }

  let {
    sieger = 'seeker', // 'seeker' | 'hider' | 'zombies' | 'menschen' | 'mrx' | 'detektive'
    letzterMensch = null as string | null,
    onRevanche = () => {},
    onLobby = () => {},
  }: Props = $props();

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

    <!-- AKTIONEN -->
    <div class="aktions-leiste">
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
</style>
