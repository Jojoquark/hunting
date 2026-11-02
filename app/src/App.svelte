<script lang="ts">
  import { onMount } from 'svelte';
  import Start from './screens/Start.svelte';
  import Einrichtung from './screens/Einrichtung.svelte';
  import Lobby from './screens/Lobby.svelte';
  import ZonenEditor from './screens/ZonenEditor.svelte';
  import Spiel from './screens/Spiel.svelte';
  import Gefangen from './screens/Gefangen.svelte';
  import Ende from './screens/Ende.svelte';
  import Profil from './screens/Profil.svelte';
  import { ermittleBasisHttpUrl } from './lib/netz/config';

  // Typdefinition für die Spielphasen / Bildschirme
  type Bildschirm =
    | 'start'
    | 'einrichtung'
    | 'lobby'
    | 'zoneneditor'
    | 'spiel'
    | 'gefangen'
    | 'ende'
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
  let spielerId = $state('');
  let spielerToken = $state('');
  let letzterSieger = $state('seeker');
  let serverFehler = $state('');
  let spielErstellenLaedt = $state(false);
  let gefangenGemeldet = false;

  interface SpielSitzung {
    code: string;
    spielerId: string;
    token: string;
    istHost: boolean;
  }

  const sitzungsSchluessel = (code: string) => `hunting_session_${code}`;

  function leseSitzung(code: string): SpielSitzung | null {
    try {
      const raw = localStorage.getItem(sitzungsSchluessel(code));
      if (!raw) return null;
      const sitzung = JSON.parse(raw) as SpielSitzung;
      return sitzung.code === code && sitzung.spielerId && sitzung.token ? sitzung : null;
    } catch {
      return null;
    }
  }

  function speichereSitzung(sitzung: SpielSitzung) {
    try {
      localStorage.setItem(sitzungsSchluessel(sitzung.code), JSON.stringify(sitzung));
    } catch {
      serverFehler = 'Dein Browser kann die Spielsitzung nicht speichern. Bitte erlaube Website-Daten.';
    }
  }

  onMount(() => {
    spitzname = `Spieler ${1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000)}`;
    try {
      const gespeicherterName = localStorage.getItem('hunting_player_name');
      if (gespeicherterName) {
        spitzname = gespeicherterName;
      } else {
        localStorage.setItem('hunting_player_name', spitzname);
      }
    } catch {
      // Die App bleibt ohne lokale Speicherung nutzbar.
    }

    const code = new URLSearchParams(window.location.search).get('code');
    if (code) void handleSpielBeitreten(code);
  });

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
  let zoneManuellGesetzt = $state(false);

  // Navigations-Helfer mit Verlaufs-Speicher
  function navigiereZu(ziel: Bildschirm) {
    vorherigerBildschirm = aktiverBildschirm;
    aktiverBildschirm = ziel;
  }

  function geheZurueck() {
    aktiverBildschirm = vorherigerBildschirm;
  }

  // Aktionen von Start
  async function handleSpielErstellen() {
    if (spielErstellenLaedt) return;
    serverFehler = '';
    spielErstellenLaedt = true;
    try {
      const antwort = await fetch(`${ermittleBasisHttpUrl()}/spiele`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!antwort.ok) {
        if (antwort.status === 429) {
          const retryAfter = Number(antwort.headers.get('Retry-After'));
          const minuten = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.max(1, Math.ceil(retryAfter / 60))
            : null;
          throw new Error(minuten
            ? `Zu viele Spiele erstellt. Bitte versuche es in etwa ${minuten} Minuten erneut.`
            : 'Zu viele Spiele erstellt. Bitte warte kurz und versuche es erneut.');
        }
        if (antwort.status >= 500) {
          throw new Error('Der Spielserver ist gerade nicht erreichbar. Bitte versuche es später erneut.');
        }
        throw new Error(`Spiel konnte nicht erstellt werden (HTTP ${antwort.status}).`);
      }
      const daten = await antwort.json() as { code?: string; spielerId?: string; token?: string };
      if (!daten.code || !daten.spielerId || !daten.token) throw new Error('Ungültige Sitzungsdaten vom Server.');
      istHost = true;
      spielCode = daten.code;
      spielerId = daten.spielerId;
      spielerToken = daten.token;
      speichereSitzung({ code: spielCode, spielerId, token: spielerToken, istHost: true });
      betreteLobby();
    } catch (fehler) {
      serverFehler = fehler instanceof Error
        ? fehler.message
        : 'Spiel konnte nicht erstellt werden. Prüfe deine Internetverbindung und versuche es erneut.';
    } finally {
      spielErstellenLaedt = false;
    }
  }

  async function handleSpielBeitreten(code: string) {
    serverFehler = '';
    const saubererCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(saubererCode)) {
      serverFehler = 'Der Spielcode muss aus 6 Buchstaben oder Zahlen bestehen.';
      return;
    }
    try {
      let sitzung = leseSitzung(saubererCode);
      if (sitzung) {
        const pruefung = await fetch(`${ermittleBasisHttpUrl()}/spiele/${encodeURIComponent(saubererCode)}`);
        if (!pruefung.ok) sitzung = null;
      }
      if (!sitzung) {
        const antwort = await fetch(`${ermittleBasisHttpUrl()}/spiele/${encodeURIComponent(saubererCode)}/beitreten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        const daten = await antwort.json() as { spielerId?: string; token?: string };
        if (!daten.spielerId || !daten.token) throw new Error('Ungültige Sitzungsdaten vom Server.');
        sitzung = { code: saubererCode, spielerId: daten.spielerId, token: daten.token, istHost: false };
        speichereSitzung(sitzung);
      }
      spielerId = sitzung.spielerId;
      spielerToken = sitzung.token;
      istHost = sitzung.istHost;
    } catch (fehler) {
      const status = fehler instanceof Error ? fehler.message : '';
      serverFehler = status === 'HTTP 409'
        ? 'Dieses Spiel läuft bereits oder ist voll.'
        : status === 'HTTP 404'
          ? 'Kein Spiel mit diesem Code gefunden.'
          : 'Spiel nicht erreichbar. Prüfe den Spielcode und deine Internetverbindung.';
      setzeCodeInUrl(null);
      return;
    }
    spielCode = saubererCode;
    betreteLobby();
  }

  // Der Code in der URL erlaubt nach Reload oder Absturz die Rückkehr in dieselbe Runde.
  function setzeCodeInUrl(code: string | null) {
    try {
      const url = new URL(window.location.href);
      if (code) url.searchParams.set('code', code);
      else url.searchParams.delete('code');
      window.history.replaceState(null, '', url);
    } catch {
      // Ohne History-API bleibt nur der manuelle Wiederbeitritt.
    }
  }

  function betreteLobby() {
    gefangenGemeldet = false;
    setzeCodeInUrl(spielCode);
    navigiereZu('lobby');
  }

  function verlasseSpiel() {
    setzeCodeInUrl(null);
    navigiereZu('start');
  }

  // Aktionen von ZonenEditor
  function handleZoneGespeichert(daten: typeof zonenDaten) {
    zonenDaten = daten;
    zoneManuellGesetzt = true;
    navigiereZu('lobby');
  }

  function handleZoneMitteAktualisiert(mitte: [number, number]) {
    if (!zoneManuellGesetzt) zonenDaten = { ...zonenDaten, mitte };
  }

  function handleSpitznameAendern(name: string) {
    const bereinigt = name.trim().slice(0, 20);
    if (!bereinigt) return;
    spitzname = bereinigt;
    try {
      localStorage.setItem('hunting_player_name', bereinigt);
    } catch {
      // Ohne Browser-Speicher wird der Name nur für diese Sitzung verwendet.
    }
  }
</script>

<div class="app-root">
  {#if aktiverBildschirm === 'start'}
    <Start
      onerstellen={handleSpielErstellen}
      onbeitreten={handleSpielBeitreten}
      {serverFehler}
      {spielErstellenLaedt}
      oneinrichtung={() => navigiereZu('einrichtung')}
      onprofil={() => navigiereZu('profil')}
    />

  {:else if aktiverBildschirm === 'einrichtung'}
    <Einrichtung onfertig={geheZurueck} />

  {:else if aktiverBildschirm === 'lobby'}
    <Lobby
      {spielCode}
      {spielerId}
      token={spielerToken}
      spielerName={spitzname}
      startModus={aktiverModus as 'klassisch' | 'zombie' | 'mrx'}
      onmoduswechsel={(modus) => (aktiverModus = modus)}
      zoneMitte={zonenDaten.mitte}
      zoneMitteRadius={zonenDaten.radius}
      zonenStufen={zonenDaten.stufen}
      radiusFaktor={zonenDaten.faktor}
      zoneManuell={zoneManuellGesetzt}
      onZoneMitteAendern={handleZoneMitteAktualisiert}
      {istHost}
      onstart={handleSpielStart}
      onverlassen={verlasseSpiel}
      onzoneneditor={() => navigiereZu('zoneneditor')}
    />

  {:else if aktiverBildschirm === 'zoneneditor'}
    <ZonenEditor
      initialMitte={zonenDaten.mitte}
      initialRadius={zonenDaten.radius}
      initialStufen={zonenDaten.stufen}
      initialFaktor={zonenDaten.faktor}
      initialMitteManuell={zoneManuellGesetzt}
      onspeichern={handleZoneGespeichert}
      onabbrechen={geheZurueck}
    />

  {:else if aktiverBildschirm === 'spiel'}
    <Spiel
      {spielerId}
      spielerName={spitzname}
      {spielCode}
      token={spielerToken}
      {istHost}
      rolle={aktiveRolle}
      modus={aktiverModus}
      onGefangen={() => {
        if (gefangenGemeldet) return;
        gefangenGemeldet = true;
        navigiereZu('gefangen');
      }}
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
      onRevanche={() => {
        verlasseSpiel();
        void handleSpielErstellen();
      }}
      onLobby={verlasseSpiel}
    />

  {:else if aktiverBildschirm === 'profil'}
    <Profil
      spitzname={spitzname}
      onSpitznameChange={handleSpitznameAendern}
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
