<script lang="ts">
  import { onMount } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';

  let {
    faengerName = 'Ein Jäger',
    zeitpunkt = '18:42',
    modus = 'klassisch', // 'klassisch' | 'zombie' | 'mrx'
    onWechselZuZuschauer = () => {},
    onWechselZuZombie = () => {},
  } = $props<{
    faengerName?: string;
    zeitpunkt?: string;
    modus?: string;
    onWechselZuZuschauer?: () => void;
    onWechselZuZombie?: () => void;
  }>();

  let istZombieModus = $derived(modus === 'zombie');

  onMount(() => {
    // Dramatische Haptik und Sirenen-Klang beim Aufrufen
    klang.fangAlarm();
  });
</script>

<div class="gefangen-screen" class:zombie-infektion={istZombieModus}>
  <!-- Schockwellen-Radar-Ringe im Hintergrund -->
  <div class="schockwelle welle-1"></div>
  <div class="schockwelle welle-2"></div>

  <div class="fang-kapsel">
    <div class="alarm-icon">
      {#if istZombieModus}
        ☣️
      {:else}
        ⚡
      {/if}
    </div>

    <h1 class="titel">{de.gefangen.titel}</h1>
    <p class="untertitel">{de.gefangen.untertitel}</p>

    <div class="info-kasten">
      <div class="faenger-zeile">
        {de.gefangen.gefangenVon.replace('%s', faengerName)}
      </div>
      <div class="zeit-zeile">
        {de.gefangen.zeitpunkt.replace('%s', zeitpunkt)}
      </div>
    </div>

    <div class="erklaerung">
      {#if istZombieModus}
        <p class="zombie-text">{de.gefangen.wechselZombie}</p>
        <button
          type="button"
          class="haupt-taste zombie-taste"
          onclick={() => {
            klang.klick();
            onWechselZuZombie();
          }}
        >
          {de.gefangen.tasteZombie}
        </button>
      {:else}
        <p class="zuschauer-text">{de.gefangen.wechselZuschauer}</p>
        <button
          type="button"
          class="haupt-taste zuschauer-taste"
          onclick={() => {
            klang.klick();
            onWechselZuZuschauer();
          }}
        >
          {de.gefangen.tasteZuschauer}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .gefangen-screen {
    position: fixed;
    inset: 0;
    background: #0a0a0c;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 200;
    overflow: hidden;
  }

  .gefangen-screen.zombie-infektion {
    background: radial-gradient(circle at center, #112208 0%, #0a0a0c 80%);
  }

  .schockwelle {
    position: absolute;
    width: 250px;
    height: 250px;
    border-radius: 50%;
    border: 2px solid rgba(255, 59, 92, 0.4);
    animation: welleExpand 2s infinite ease-out;
  }

  .zombie-infektion .schockwelle {
    border-color: rgba(143, 227, 58, 0.4);
  }

  .welle-2 {
    animation-delay: 0.8s;
  }

  @keyframes welleExpand {
    0% {
      transform: scale(0.6);
      opacity: 1;
    }
    100% {
      transform: scale(2.8);
      opacity: 0;
    }
  }

  .fang-kapsel {
    position: relative;
    z-index: 10;
    background: rgba(20, 20, 24, 0.88);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 32px;
    padding: 36px 24px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  }

  .alarm-icon {
    font-size: 3.5rem;
    margin-bottom: 12px;
    line-height: 1;
  }

  .titel {
    font-size: 1.8rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: #ff3b5c;
    margin: 0 0 6px 0;
  }

  .zombie-infektion .titel {
    color: #8fe33a;
  }

  .untertitel {
    color: #a3a3ad;
    font-size: 0.95rem;
    margin: 0 0 24px 0;
  }

  .info-kasten {
    background: #14141a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .faenger-zeile {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f2f2ee;
    margin-bottom: 4px;
  }

  .zeit-zeile {
    font-size: 0.85rem;
    color: #a3a3ad;
    font-variant-numeric: tabular-nums;
  }

  .erklaerung p {
    font-size: 0.9rem;
    line-height: 1.5;
    color: #e4e4e7;
    margin-bottom: 24px;
  }

  .haupt-taste {
    width: 100%;
    border: none;
    border-radius: 16px;
    padding: 16px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.1s ease-out;
  }

  .haupt-taste:active {
    transform: scale(0.97);
  }

  .zuschauer-taste {
    background: #ff5c00;
    color: #000;
  }

  .zombie-taste {
    background: #8fe33a;
    color: #000;
  }
</style>
