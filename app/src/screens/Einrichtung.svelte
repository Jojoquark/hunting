<script lang="ts">
  import GlasKnopf from '../lib/ui/GlasKnopf.svelte';
  import GlasKapsel from '../lib/ui/GlasKapsel.svelte';
  import Icon from '../lib/ui/Icon.svelte';

  interface Props {
    onfertig?: () => void;
  }

  let { onfertig }: Props = $props();

  let standortStatus = $state<'unbekannt' | 'erlaubt' | 'abgelehnt'>('unbekannt');
  let pushStatus = $state<'unbekannt' | 'erlaubt' | 'abgelehnt'>('unbekannt');
  let istIOS = $state(false);

  // Plattform-Erkennung
  if (typeof navigator !== 'undefined') {
    istIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }

  async function fordereStandortAn() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation wird von diesem Gerät nicht unterstützt.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        standortStatus = 'erlaubt';
      },
      () => {
        standortStatus = 'abgelehnt';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function forderePushAn() {
    if (!('Notification' in window)) {
      alert('Benachrichtigungen werden nicht unterstützt.');
      return;
    }
    const ergebnis = await Notification.requestPermission();
    if (ergebnis === 'granted') {
      pushStatus = 'erlaubt';
    } else {
      pushStatus = 'abgelehnt';
    }
  }

  let bereit = $derived(standortStatus === 'erlaubt' && pushStatus === 'erlaubt');
</script>

<div class="einrichtung-screen">
  <header class="einrichtung-header">
    <h1 class="titel">Bereit für die Jagd?</h1>
    <p class="untertitel">HUNTING benötigt 2 Freigaben, um ein faires GPS-Spiel ohne Schummeln zu garantieren.</p>
  </header>

  <main class="schritte-liste">
    <!-- Schritt 1: PWA Home-Bildschirm (Besonders wichtig für iOS) -->
    <section class="schritt-karte deckend">
      <div class="schritt-kopf">
        <div class="schritt-nummer">1</div>
        <div class="schritt-info">
          <h2 class="schritt-titel">Zum Home-Bildschirm hinzufügen</h2>
          <p class="schritt-erklaerung">
            {#if istIOS}
              Tippe im Safari-Menü auf <strong>Teilen</strong> und wähle <strong>„Zum Home-Bildschirm“</strong>. Nur so laufen Push-Benachrichtigungen im Hintergrund zuverlässig.
            {:else}
              Installiere HUNTING als PWA über das Browsermenü für flüssiges Vollbild ohne Adressleiste.
            {/if}
          </p>
        </div>
      </div>
    </section>

    <!-- Schritt 2: GPS-Standort -->
    <section class="schritt-karte deckend">
      <div class="schritt-kopf">
        <div class="schritt-nummer">2</div>
        <div class="schritt-info">
          <div class="titel-mit-status">
            <h2 class="schritt-titel">Präziser Standort (GPS)</h2>
            {#if standortStatus === 'erlaubt'}
              <span class="status-badge status-ok"><Icon name="check" size={14} /> Aktiv</span>
            {/if}
          </div>
          <p class="schritt-erklaerung">
            <strong>Warum?</strong> HUNTING berechnet Fänge und Zonenradien live. Deine Koordinaten werden nur während des aktiven Spiels verschlüsselt verarbeitet.
          </p>
        </div>
      </div>

      {#if standortStatus !== 'erlaubt'}
        <div class="schritt-aktion">
          <GlasKnopf variante="sekundaer" groesse="md" breit={true} onclick={fordereStandortAn}>
            <Icon name="locate" size={18} />
            <span>Standortzugriff erlauben</span>
          </GlasKnopf>
        </div>
      {/if}
    </section>

    <!-- Schritt 3: Web-Push (Funkloch-Schutz) -->
    <section class="schritt-karte deckend">
      <div class="schritt-kopf">
        <div class="schritt-nummer">3</div>
        <div class="schritt-info">
          <div class="titel-mit-status">
            <h2 class="schritt-titel">Mitteilungen (Push)</h2>
            {#if pushStatus === 'erlaubt'}
              <span class="status-badge status-ok"><Icon name="check" size={14} /> Aktiv</span>
            {/if}
          </div>
          <p class="schritt-erklaerung">
            <strong>Warum?</strong> Vor jedem Ping erhältst du 60 Sekunden vorher eine Warnung, die App kurz zu öffnen – so vermeidest du die gefürchtete <em>Funkloch-Strafe</em>!
          </p>
        </div>
      </div>

      {#if pushStatus !== 'erlaubt'}
        <div class="schritt-aktion">
          <GlasKnopf variante="sekundaer" groesse="md" breit={true} onclick={forderePushAn}>
            <Icon name="radar" size={18} />
            <span>Push-Mitteilungen aktivieren</span>
          </GlasKnopf>
        </div>
      {/if}
    </section>

    <!-- Sicherheits-Hinweis (Straßenverkehr) -->
    <div class="sicherheits-box">
      <Icon name="alert-triangle" size={20} color="var(--akzent)" />
      <p class="sicherheits-text">
        <strong>Wichtiger Hinweis:</strong> Achte beim Spielen immer auf deine Umwelt und den Straßenverkehr. Niemals Bahngleise, Baustellen oder gesperrtes Gelände betreten!
      </p>
    </div>
  </main>

  <footer class="einrichtung-footer">
    <GlasKnopf variante="primaer" groesse="lg" breit={true} onclick={onfertig}>
      <span>{bereit ? 'Alles bereit – Loslegen' : 'Trotzdem fortfahren'}</span>
      <Icon name="arrow-right" size={20} color="#0a0a0c" />
    </GlasKnopf>
  </footer>
</div>

<style>
  .einrichtung-screen {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)) 20px;
    background: var(--grund);
    overflow-y: auto;
  }

  .einrichtung-header {
    margin-bottom: 24px;
  }

  .titel {
    font-family: var(--font-headline);
    font-size: clamp(1.75rem, 6vw, 2.4rem);
    font-weight: 700;
    color: var(--tinte);
    line-height: 1.15;
    margin-bottom: 8px;
  }

  .untertitel {
    font-size: 0.9375rem;
    color: var(--tinte-2);
    line-height: 1.45;
  }

  .schritte-liste {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  }

  /* Deckende Flächen für Inhaltskarten nach Liquid Glass Verbot auf Content-Layer */
  .schritt-karte.deckend {
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-m);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .schritt-kopf {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .schritt-nummer {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--flaeche-erhoeht);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tinte);
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .schritt-info {
    flex: 1;
  }

  .titel-mit-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .schritt-titel {
    font-family: var(--font-headline);
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--tinte);
    margin: 0;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: var(--radius-kapsel);
  }

  .status-ok {
    background: rgba(0, 229, 153, 0.15);
    color: #00e599;
    border: 1px solid rgba(0, 229, 153, 0.3);
  }

  .schritt-erklaerung {
    font-size: 0.875rem;
    color: var(--tinte-2);
    line-height: 1.4;
    margin: 0;
  }

  .schritt-erklaerung strong {
    color: var(--tinte);
  }

  .schritt-erklaerung em {
    color: var(--akzent);
    font-style: normal;
    font-weight: 600;
  }

  .schritt-aktion {
    margin-top: 4px;
  }

  .sicherheits-box {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border-radius: var(--radius-s);
    background: rgba(255, 92, 0, 0.08);
    border: 1px solid rgba(255, 92, 0, 0.22);
  }

  .sicherheits-text {
    font-size: 0.8125rem;
    color: var(--tinte-2);
    line-height: 1.4;
    margin: 0;
  }

  .sicherheits-text strong {
    color: var(--akzent);
  }

  .einrichtung-footer {
    padding-top: 20px;
  }
</style>
