<script lang="ts">
  import Start from './screens/Start.svelte';
  import Einrichtung from './screens/Einrichtung.svelte';
  import Lobby from './screens/Lobby.svelte';
  import ZonenEditor from './screens/ZonenEditor.svelte';
  import Spiel from './screens/Spiel.svelte';
  import Gefangen from './screens/Gefangen.svelte';
  import Ende from './screens/Ende.svelte';
  import Replay from './screens/Replay.svelte';
  import Profil from './screens/Profil.svelte';

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
  let aktiverModus = $state('klassisch');
  let aktiveRolle = $state('seeker');
  let spielerId = $state('sp-' + Math.random().toString(36).substring(2, 6));
  let letzterSieger = $state('seeker');

  function handleSpielStart(daten?: { modus?: string; rolle?: string }) {
    if (daten?.modus) aktiverModus = daten.modus;
    if (daten?.rolle) aktiveRolle = daten.rolle;
    navigiereZu('spiel');
  }

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
      onstart={handleSpielStart}
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

  {:else if aktiverBildschirm === 'spiel'}
    <Spiel
      {spielerId}
      {spielCode}
      rolle={aktiveRolle}
      modus={aktiverModus}
      onGefangen={() => navigiereZu('gefangen')}
      onSpielEnde={(sieger) => {
        letzterSieger = sieger;
        navigiereZu('ende');
      }}
    />

  {:else if aktiverBildschirm === 'gefangen'}
    <Gefangen
      modus={aktiverModus}
      onWechselZuZuschauer={() => navigiereZu('spiel')}
      onWechselZuZombie={() => {
        aktiveRolle = 'zombie';
        navigiereZu('spiel');
      }}
    />

  {:else if aktiverBildschirm === 'ende'}
    <Ende
      sieger={letzterSieger}
      onReplay={() => navigiereZu('replay')}
      onRevanche={() => navigiereZu('lobby')}
      onLobby={() => navigiereZu('lobby')}
    />

  {:else if aktiverBildschirm === 'replay'}
    <Replay
      onSchliessen={() => navigiereZu('ende')}
    />

  {:else if aktiverBildschirm === 'profil'}
    <Profil
      spitzname={spitzname}
      onZurueck={geheZurueck}
    />
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
</style>
