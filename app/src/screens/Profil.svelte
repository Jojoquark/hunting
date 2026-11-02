<script lang="ts">
  import { untrack } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';
  import { geoTracker } from '../lib/ortung/geolocation';

  interface Props {
    spitzname?: string;
    onZurueck?: () => void;
    onSpitznameChange?: (name: string) => void;
  }

  let {
    spitzname = 'Geist-07',
    onZurueck = () => {},
    onSpitznameChange = () => {},
  }: Props = $props();

  let lokalerName = $state(untrack(() => spitzname));
  let tonAktiv = $state(!klang.stumm);
  let haptikAktiv = $state(klang.haptikAktiv);
  let wakeLockAktiv = $state(geoTracker.wakeLockAktiv);

  function toggleTon() {
    tonAktiv = !tonAktiv;
    klang.stumm = !tonAktiv;
    if (tonAktiv) klang.radarPing();
  }

  function toggleHaptik() {
    haptikAktiv = !haptikAktiv;
    klang.haptikAktiv = haptikAktiv;
    if (haptikAktiv) klang.vibriere(50);
  }

  function toggleWakeLock() {
    geoTracker.toggleWakeLock().then((aktiv) => {
      wakeLockAktiv = aktiv;
    });
  }
</script>

<div class="profil-screen">
  <div class="glas-container profil-karte">
    <header class="profil-kopf">
      <button type="button" class="zurueck-taste" onclick={() => { klang.klick(); onZurueck(); }}>
        ← {de.allgemein.zurueck}
      </button>
      <h2>{de.profil.titel}</h2>
    </header>

    <!-- SPITZNAME -->
    <div class="sektion">
      <label for="spitzname-input" class="sektion-label">{de.profil.spitzname}</label>
      <input
        id="spitzname-input"
        type="text"
        bind:value={lokalerName}
        onchange={() => onSpitznameChange(lokalerName)}
        class="name-eingabe"
        maxlength="20"
      />
      <p class="profil-hinweis">Der Name wird nur in diesem Browser gespeichert.</p>
    </div>

    <!-- EINSTELLUNGEN -->
    <div class="sektion">
      <div class="sektion-label">Hardware & Effekte</div>
      <div class="schalter-liste">
        <button type="button" class="schalter-zeile" onclick={toggleTon}>
          <span>{de.profil.einstellungen.ton}</span>
          <span class="schalter-status" class:an={tonAktiv}>{tonAktiv ? 'AN' : 'AUS'}</span>
        </button>

        <button type="button" class="schalter-zeile" onclick={toggleHaptik}>
          <span>{de.profil.einstellungen.vibration}</span>
          <span class="schalter-status" class:an={haptikAktiv}>{haptikAktiv ? 'AN' : 'AUS'}</span>
        </button>

        <button type="button" class="schalter-zeile" onclick={toggleWakeLock}>
          <span>{de.profil.einstellungen.wakeLock}</span>
          <span class="schalter-status" class:an={wakeLockAktiv}>{wakeLockAktiv ? 'AN' : 'AUS'}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .profil-screen {
    position: fixed;
    inset: 0;
    background: #0a0a0c;
    display: flex;
    justify-content: center;
    padding: env(safe-area-inset-top, 20px) 16px env(safe-area-inset-bottom, 24px) 16px;
    overflow-y: auto;
    z-index: 100;
  }

  .glas-container {
    background: rgba(20, 20, 24, 0.82);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    border-radius: 32px;
    color: #f2f2ee;
  }

  .profil-karte {
    max-width: 460px;
    width: 100%;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin: auto 0;
  }

  .profil-kopf {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .profil-kopf h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .zurueck-taste {
    background: transparent;
    border: none;
    color: #ff5c00;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .sektion {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sektion-label {
    font-size: 0.75rem;
    color: #a3a3ad;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .name-eingabe {
    background: #121216;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    color: #f2f2ee;
    padding: 12px 16px;
    font-size: 1rem;
    font-weight: 600;
  }

  .profil-hinweis {
    margin: 0;
    color: #a3a3ad;
    font-size: 0.75rem;
  }

  .schalter-liste {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .schalter-zeile {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #131318;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px 16px;
    color: #f2f2ee;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .schalter-status {
    font-weight: 700;
    font-size: 0.75rem;
    color: #71717a;
  }

  .schalter-status.an {
    color: #ff5c00;
  }
</style>
