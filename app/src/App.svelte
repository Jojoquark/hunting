<script lang="ts">
  import Start from './screens/Start.svelte';
  import Einrichtung from './screens/Einrichtung.svelte';
  import Lobby from './screens/Lobby.svelte';
  import ZonenEditor from './screens/ZonenEditor.svelte';
  import GlasKnopf from './lib/ui/GlasKnopf.svelte';
  import GlasKapsel from './lib/ui/GlasKapsel.svelte';
  import Icon from './lib/ui/Icon.svelte';

  // Typdefinition für die Spielphasen / Bildschirme
  type Bildschirm =
    | 'start'
    | 'einrichtung'
    | 'lobby'
    | 'zoneneditor'
    | 'spiel'
    | 'gefangen'
    | 'ende'
    | 'replay'
    | 'profil';

  // Zentraler Routing-Zustand (Svelte 5 Runes)
  let aktiverBildschirm = $state<Bildschirm>('start');
  let vorherigerBildschirm = $state<Bildschirm>('start');

  // Spiel- & Sitzungsdaten
  let spielCode = $state('HNT-782');
  let istHost = $state(true);
  let spitzname = $state('Jäger Eins');

  // Zonen-Zustand
  let zonenDaten = $state({
    mitte: [13.405, 52.52] as [number, number],
    radius: 1000,
    stufen: 4,
    faktor: 0.65
  });

  // Navigations-Helfer mit Verlaufs-Speicher
  function navigiereZu(ziel: Bildschirm) {
    vorherigerBildschirm = aktiverBildschirm;
    aktiverBildschirm = ziel;
  }

  function geheZurueck() {
    aktiverBildschirm = vorherigerBildschirm;
  }

  // Aktionen von Start
  function handleSpielErstellen() {
    istHost = true;
    spielCode = 'HNT-' + Math.floor(100 + Math.random() * 900);
    navigiereZu('lobby');
  }

  function handleSpielBeitreten(code: string) {
    istHost = false;
    spielCode = code;
    navigiereZu('lobby');
  }

  // Aktionen von ZonenEditor
  function handleZoneGespeichert(daten: typeof zonenDaten) {
    zonenDaten = daten;
    navigiereZu('lobby');
  }
</script>

<div class="app-root">
  {#if aktiverBildschirm === 'start'}
    <Start
      onerstellen={handleSpielErstellen}
      onbeitreten={handleSpielBeitreten}
      oneinrichtung={() => navigiereZu('einrichtung')}
      onprofil={() => navigiereZu('profil')}
    />

  {:else if aktiverBildschirm === 'einrichtung'}
    <Einrichtung onfertig={geheZurueck} />

  {:else if aktiverBildschirm === 'lobby'}
    <Lobby
      {spielCode}
      {istHost}
      onstart={() => navigiereZu('spiel')}
      onverlassen={() => navigiereZu('start')}
      onzoneneditor={() => navigiereZu('zoneneditor')}
    />

  {:else if aktiverBildschirm === 'zoneneditor'}
    <ZonenEditor
      initialMitte={zonenDaten.mitte}
      initialRadius={zonenDaten.radius}
      initialStufen={zonenDaten.stufen}
      initialFaktor={zonenDaten.faktor}
      onspeichern={handleZoneGespeichert}
      onabbrechen={geheZurueck}
    />

  <!-- Integrierte Fallback- & Entwicklungsansichten für Spezialbildschirme -->
  {:else if aktiverBildschirm === 'spiel'}
    <div class="dummy-screen">
      <div class="screen-box">
        <h2 class="screen-titel">JAGD LÄUFT</h2>
        <p class="screen-info">Das Spiel läuft aktiv. Das HUD wird von der Game-Engine gesteuert.</p>
        <div class="demo-aktionen">
          <GlasKnopf variante="gefahr" groesse="md" onclick={() => navigiereZu('gefangen')}>
            <span>Gefangen-Moment simulieren</span>
          </GlasKnopf>
          <GlasKnopf variante="sekundaer" groesse="md" onclick={() => navigiereZu('ende')}>
            <span>Spiel beenden</span>
          </GlasKnopf>
        </div>
      </div>
    </div>

  {:else if aktiverBildschirm === 'gefangen'}
    <div class="dummy-screen voll-gefahr">
      <div class="screen-box">
        <Icon name="crosshair" size={48} color="var(--rolle-jaeger)" />
        <h1 class="alarm-titel">DU WURDEST GEFANGEN!</h1>
        <p class="screen-info">Du wechselst nun in den Zuschauer- oder Zombie-Modus.</p>
        <GlasKnopf variante="sekundaer" groesse="lg" onclick={() => navigiereZu('spiel')}>
          <span>Als Zuschauer zusehen</span>
        </GlasKnopf>
      </div>
    </div>

  {:else if aktiverBildschirm === 'ende'}
    <div class="dummy-screen">
      <div class="screen-box">
        <h1 class="sieger-titel">JAGD BEENDET</h1>
        <p class="screen-info">Team Jäger hat alle Gejagten vor Zeitablauf aufgespürt.</p>
        <div class="demo-aktionen">
          <GlasKnopf variante="primaer" groesse="lg" onclick={() => navigiereZu('replay')}>
            <Icon name="radar" size={20} color="#0a0a0c" />
            <span>Replay ansehen</span>
          </GlasKnopf>
          <GlasKnopf variante="sekundaer" groesse="md" onclick={() => navigiereZu('lobby')}>
            <span>Revanche in Lobby</span>
          </GlasKnopf>
          <GlasKnopf variante="flach" groesse="sm" onclick={() => navigiereZu('start')}>
            <span>Hauptmenü</span>
          </GlasKnopf>
        </div>
      </div>
    </div>

  {:else if aktiverBildschirm === 'replay'}
    <div class="dummy-screen">
      <div class="screen-box">
        <h2 class="screen-titel">SPIEL-REPLAY</h2>
        <p class="screen-info">Interaktive Zeitleiste und Bewegungspfade aller Spieler.</p>
        <GlasKnopf variante="sekundaer" groesse="md" onclick={() => navigiereZu('ende')}>
          <Icon name="arrow-right" size={18} />
          <span>Zurück zur Auswertung</span>
        </GlasKnopf>
      </div>
    </div>

  {:else if aktiverBildschirm === 'profil'}
    <div class="dummy-screen">
      <div class="screen-box">
        <div class="profil-icon">
          <Icon name="user" size={32} />
        </div>
        <h2 class="screen-titel">{spitzname}</h2>
        <p class="screen-info">Statistiken: 14 Jagden, 38 km gelaufen, 8 Überlebenssiege.</p>
        <GlasKnopf variante="sekundaer" groesse="md" onclick={geheZurueck}>
          <span>Zurück</span>
        </GlasKnopf>
      </div>
    </div>
  {/if}
</div>

<style>
  .app-root {
    width: 100%;
    height: 100%;
    position: relative;
    background: var(--grund);
    color: var(--tinte);
    overflow: hidden;
  }

  /* Platzhalter-Styling für nachfolgende Module */
  .dummy-screen {
    width: 100%;
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--grund);
    text-align: center;
  }

  .dummy-screen.voll-gefahr {
    background: radial-gradient(circle at center, rgba(255, 59, 92, 0.25) 0%, var(--grund) 80%);
  }

  .screen-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: 380px;
  }

  .screen-titel {
    font-family: var(--font-headline);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--tinte);
  }

  .alarm-titel {
    font-family: var(--font-headline);
    font-size: 2rem;
    font-weight: 700;
    color: var(--rolle-jaeger);
    letter-spacing: -0.02em;
  }

  .sieger-titel {
    font-family: var(--font-headline);
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--akzent);
  }

  .screen-info {
    font-size: 0.9375rem;
    color: var(--tinte-2);
    line-height: 1.4;
  }

  .demo-aktionen {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-top: 12px;
  }

  .profil-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--flaeche-erhoeht);
    border: 1px solid var(--glas-kante);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tinte);
  }
</style>
