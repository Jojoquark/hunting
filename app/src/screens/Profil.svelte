<script lang="ts">
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';
  import { geoTracker } from '../lib/ortung/geolocation';

  let {
    spitzname = 'Geist-07',
    googleKonto = null as string | null, // z.B. 'user@gmail.com'
    statistiken = {
      spiele: 14,
      seekerSiege: 8,
      hiderSiege: 4,
      gesamtKm: 42.8,
      faenge: 19,
    },
    onZurueck = () => {},
    onGoogleLogin = () => {},
  } = $props<{
    spitzname?: string;
    googleKonto?: string | null;
    statistiken?: {
      spiele: number;
      seekerSiege: number;
      hiderSiege: number;
      gesamtKm: number;
      faenge: number;
    };
    onZurueck?: () => void;
    onGoogleLogin?: () => void;
  }>();

  let lokalerName = $state(spitzname);
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
        class="name-eingabe"
        maxlength="20"
      />
    </div>

    <!-- CLOUD & GOOGLE SYNC -->
    <div class="sektion">
      <div class="sektion-label">{de.profil.konto}</div>
      {#if googleKonto}
        <div class="konto-karte verbunden">
          <span class="status-dot"></span>
          <span>{de.profil.googleVerbunden.replace('%s', googleKonto)}</span>
        </div>
      {:else}
        <button type="button" class="google-taste" onclick={() => { klang.klick(); onGoogleLogin(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5c1.5 0 2.8.5 3.8 1.4l2.9-2.9C16.9 1.8 14.6 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.4 7.2 8.9 5 12 5z"/>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z"/>
            <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.4-.4-2.2s.2-1.5.4-2.2L1.9 7.5C.7 9.8 0 12.3 0 15s.7 5.2 1.9 7.5l3.7-2.9c-.2-.8-.4-1.5-.4-2.2z"/>
            <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.6-2.2-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"/>
          </svg>
          <span>{de.profil.googleVerbinden}</span>
        </button>
      {/if}
    </div>

    <!-- STATISTIKEN -->
    <div class="sektion">
      <div class="sektion-label">{de.profil.statistikenTitel}</div>
      <div class="stats-raster">
        <div class="stat-feld">
          <span class="stat-wert">{statistiken.spiele}</span>
          <span class="stat-label">{de.profil.spieleGesamt}</span>
        </div>
        <div class="stat-feld">
          <span class="stat-wert">{statistiken.seekerSiege}</span>
          <span class="stat-label">{de.profil.siegeSeeker}</span>
        </div>
        <div class="stat-feld">
          <span class="stat-wert">{statistiken.hiderSiege}</span>
          <span class="stat-label">{de.profil.siegeHider}</span>
        </div>
        <div class="stat-feld">
          <span class="stat-wert">{statistiken.gesamtKm} km</span>
          <span class="stat-label">{de.profil.gesamtKm}</span>
        </div>
      </div>
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

  .google-taste {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #181820;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    color: #f2f2ee;
    padding: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .konto-karte.verbunden {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #14141a;
    border: 1px solid rgba(58, 209, 255, 0.2);
    padding: 12px 16px;
    border-radius: 14px;
    font-size: 0.85rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3ad1ff;
  }

  .stats-raster {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-feld {
    background: #131318;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-wert {
    font-weight: 800;
    font-size: 1.15rem;
    color: #f2f2ee;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 0.7rem;
    color: #a3a3ad;
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
