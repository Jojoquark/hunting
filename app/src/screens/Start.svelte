<script lang="ts">
  import { onMount } from 'svelte';
  import GlasKnopf from '../lib/ui/GlasKnopf.svelte';
  import GlasKapsel from '../lib/ui/GlasKapsel.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';

  interface Props {
    onerstellen?: () => void;
    onbeitreten?: (code: string) => void;
    oneinrichtung?: () => void;
    onprofil?: () => void;
  }

  let { onerstellen, onbeitreten, oneinrichtung, onprofil }: Props = $props();

  let codeSheetOffen = $state(false);
  let spielCode = $state('');
  let fehlerText = $state('');
  let istGitHubPages = $state(false);
  let istOnline = $state(true);

  onMount(() => {
    if (typeof window !== 'undefined') {
      istGitHubPages =
        window.location.hostname.includes('github.io') ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      istOnline = navigator.onLine;

      const onlineHandler = () => (istOnline = true);
      const offlineHandler = () => (istOnline = false);

      window.addEventListener('online', onlineHandler);
      window.addEventListener('offline', offlineHandler);

      return () => {
        window.removeEventListener('online', onlineHandler);
        window.removeEventListener('offline', offlineHandler);
      };
    }
  });

  function starteBeitritt() {
    const sauber = spielCode.trim().toUpperCase();
    if (sauber.length < 6) {
      fehlerText = 'Bitte gib den vollständigen 6-stelligen Code ein.';
      return;
    }
    fehlerText = '';
    codeSheetOffen = false;
    onbeitreten?.(sauber);
  }
</script>

<div class="start-screen">
  <!-- Obere Funktionsleiste mit Liquid-Glass Statuskapsel -->
  <header class="start-header">
    <div class="status-kapsel-gruppe">
      <GlasKapsel variante="kapsel" klasse="header-status-pill">
        <div class="status-segment">
          <span class="status-punkt" class:offline={!istOnline}></span>
          <span class="status-text">{istOnline ? 'GPS BEREIT' : 'OFFLINE'}</span>
        </div>

        <span class="status-trenner" aria-hidden="true"></span>

        <!-- GitHub Pages & Instant-Onboarding Reassurance Badge -->
        <div class="status-segment onboarding-badge">
          <Icon name="globe" size={13} color="var(--tinte-2)" />
          <span class="onboarding-text">
            {istGitHubPages ? 'Online-Modus bereit' : 'Sofort im Browser spielbar'}
          </span>
        </div>
      </GlasKapsel>
    </div>

    <div class="header-aktionen">
      <button class="symbol-kapsel-knopf" onclick={oneinrichtung} aria-label="Einrichtung & Status">
        <Icon name="settings" size={20} />
      </button>
      <button class="symbol-kapsel-knopf" onclick={onprofil} aria-label="Mein Profil">
        <Icon name="user" size={20} />
      </button>
    </div>
  </header>

  <!-- Hero-Zentrum: Boldschwarze Ästhetik, solide Tinte ohne Farbverlauf -->
  <main class="start-main">
    <div class="hero-gruppe">
      <h1 class="hero-titel">HUNTING</h1>
      <p class="hero-untertitel">Das GPS-Echtzeit-Jagdspiel für dein Revier.</p>
    </div>

    <!-- Direkte, taktile Hauptaktionen -->
    <div class="start-aktionen">
      <GlasKnopf variante="primaer" groesse="lg" breit={true} onclick={onerstellen}>
        <Icon name="plus" size={22} color="#0a0a0c" />
        <span>Spiel erstellen</span>
      </GlasKnopf>

      <GlasKnopf variante="sekundaer" groesse="lg" breit={true} onclick={() => (codeSheetOffen = true)}>
        <Icon name="crosshair" size={22} />
        <span>Spiel beitreten</span>
      </GlasKnopf>
    </div>
  </main>

  <!-- Fußzeile mit Video-Wachhalter Reassurance & Einrichtungs-Link -->
  <footer class="start-footer">
    <div class="start-footer-bar">
      <div class="wachhalter-reassurance">
        <Icon name="awake" size={14} color="var(--akzent)" />
        <span class="wachhalter-info-text">Display-Wachhalter aktiv</span>
      </div>

      <span class="footer-dot-sep">•</span>

      <button class="hilfe-link" onclick={oneinrichtung}>
        <Icon name="alert-triangle" size={14} color="var(--tinte-2)" />
        <span>Berechtigungs-Check</span>
      </button>
    </div>
  </footer>

  <!-- Beitreten-Sheet -->
  <Sheet offen={codeSheetOffen} titel="Spiel beitreten" onclose={() => (codeSheetOffen = false)}>
    <div class="beitritt-formular">
      <p class="anweisung">Gib den 6-stelligen Spielcode des Hosts ein:</p>

      <div class="code-eingabe-wrapper">
        <input
          type="text"
          bind:value={spielCode}
          maxlength="6"
          placeholder="z.B. X7K9A2"
          class="code-input tabular-nums"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
        />
      </div>

      {#if fehlerText}
        <div class="fehler-meldung">{fehlerText}</div>
      {/if}

      <div class="sheet-aktionen">
        <GlasKnopf variante="primaer" groesse="lg" breit={true} onclick={starteBeitritt}>
          <span>Lobby betreten</span>
          <Icon name="arrow-right" size={20} color="#0a0a0c" />
        </GlasKnopf>
      </div>
    </div>
  </Sheet>
</div>

<style>
  .start-screen {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: max(16px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)) 24px;
    background: radial-gradient(circle at 50% 30%, #16161c 0%, var(--grund) 70%);
  }

  .start-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
  }

  .status-kapsel-gruppe {
    display: flex;
    align-items: center;
  }

  :global(.header-status-pill) {
    display: inline-flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 6px 14px !important;
  }

  .status-segment {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-punkt {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00e599;
    box-shadow: 0 0 8px rgba(0, 229, 153, 0.6);
  }

  .status-punkt.offline {
    background: #ff3b5c;
    box-shadow: 0 0 8px rgba(255, 59, 92, 0.6);
  }

  .status-text {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--tinte);
  }

  .status-trenner {
    width: 1px;
    height: 14px;
    background: rgba(255, 255, 255, 0.16);
  }

  .onboarding-badge {
    gap: 6px;
  }

  .onboarding-text {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--tinte-2);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .header-aktionen {
    display: flex;
    gap: 10px;
  }

  .symbol-kapsel-knopf {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--glas-grund);
    border: 1px solid var(--glas-kante);
    color: var(--tinte);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    transition: transform var(--zeit-schnell) var(--feder-aus), background-color var(--zeit-schnell) ease-out;
  }
  .symbol-kapsel-knopf:active {
    transform: scale(0.92);
  }

  .start-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
  }

  .hero-gruppe {
    margin-bottom: 48px;
  }

  .hero-titel {
    font-family: var(--font-headline);
    font-size: clamp(3rem, 11vw, 5.2rem);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--tinte);
    margin: 0 0 16px 0;
  }

  .hero-untertitel {
    font-size: 1.125rem;
    color: var(--tinte-2);
    margin: 0;
    line-height: 1.45;
    max-width: 32ch;
  }

  .start-aktionen {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
  }

  .start-footer {
    display: flex;
    justify-content: center;
    padding-top: 16px;
  }

  .start-footer-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-kapsel);
    padding: 6px 14px;
  }

  .wachhalter-reassurance {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--tinte-2);
  }

  .wachhalter-info-text {
    font-weight: 500;
  }

  .footer-dot-sep {
    color: var(--tinte-3);
    font-size: 0.8rem;
  }

  .hilfe-link {
    background: transparent;
    border: none;
    color: var(--tinte-2);
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 2px 4px;
    transition: color var(--zeit-schnell) ease-out;
  }
  .hilfe-link:hover {
    color: var(--tinte);
  }

  .beitritt-formular {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .anweisung {
    color: var(--tinte-2);
    font-size: 0.9375rem;
    margin: 0;
  }

  .code-eingabe-wrapper {
    display: flex;
    justify-content: center;
  }

  .code-input {
    width: 100%;
    height: 64px;
    background: var(--flaeche-erhoeht);
    border: 2px solid var(--glas-kante);
    border-radius: var(--radius-m);
    color: var(--tinte);
    font-family: var(--font-mono);
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.35em;
    outline: none;
    transition: border-color var(--zeit-schnell) ease-out;
  }
  .code-input:focus {
    border-color: var(--akzent);
  }

  .fehler-meldung {
    color: var(--rolle-jaeger);
    font-size: 0.875rem;
    font-weight: 500;
    text-align: center;
  }

  .sheet-aktionen {
    margin-top: 8px;
  }
</style>
