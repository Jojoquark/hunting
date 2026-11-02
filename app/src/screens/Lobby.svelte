<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { spielNetz } from '../lib/netz/socket';
  import QRCode from 'qrcode';
  import GlasKnopf from '../lib/ui/GlasKnopf.svelte';
  import GlasKapsel from '../lib/ui/GlasKapsel.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';
  import { pruefeBalance } from '../../../shared/src/balance';

  export interface LobbySpieler {
    id: string;
    name: string;
    rolle: string;
    istHost: boolean;
    istIch: boolean;
    gpsBereit: boolean;
  }

  interface Props {
    spielCode?: string;
    spielerId?: string;
    token?: string;
    spielerName?: string;
    istHost?: boolean;
    startModus?: 'klassisch' | 'zombie' | 'mrx';
    onmoduswechsel?: (modus: string) => void;
    zoneMitte?: [number, number];
    zoneMitteRadius?: number;
    zonenStufen?: number;
    radiusFaktor?: number;
    zoneManuell?: boolean;
    onZoneMitteAendern?: (mitte: [number, number]) => void;
    onZoneRadiusAendern?: (radius: number) => void;
    onstart?: (daten?: { modus: string; rolle: string }) => void;
    onverlassen?: () => void;
    onzoneneditor?: () => void;
  }

  let {
    spielCode = 'HNT-782',
    spielerId = '',
    token = '',
    spielerName = 'Spieler',
    istHost = true,
    startModus = 'klassisch',
    onmoduswechsel,
    zoneMitte = [13.405, 52.52],
    zoneMitteRadius = 1000,
    zonenStufen = 4,
    radiusFaktor = 0.65,
    zoneManuell = false,
    onZoneMitteAendern,
    onZoneRadiusAendern,
    onstart,
    onverlassen,
    onzoneneditor
  }: Props = $props();

  let spieler = $state<LobbySpieler[]>([]);
  let modus = $state<'klassisch' | 'zombie' | 'mrx'>(untrack(() => startModus));
  let spielVerbindungAktiv = $state(false);
  let verbindungsFehler = $state('');
  let zoneBereit = $state(untrack(() => zoneManuell));
  let settingsSheetOffen = $state(false);
  let qrSheetOffen = $state(false);
  let qrDataUrl = $state('');
  let codeKopiert = $state(false);

  // Voreinstellungen (Presets nach §4)
  let presets = [
    { id: 'schnell', name: 'Schnell (20m)', dauer: 20, versteck: 3, ping: 2, radius: 400, stufen: 3 },
    { id: 'standard', name: 'Standard (60m)', dauer: 60, versteck: 10, ping: 5, radius: 1000, stufen: 4 },
    { id: 'stadtjagd', name: 'Stadtjagd (2h)', dauer: 120, versteck: 15, ping: 10, radius: 4000, stufen: 5 }
  ];
  let gewaehltesPreset = $state('standard');
  let spieldauer = $state(60);
  let versteckzeit = $state(10);
  let pingIntervall = $state(5);
  let zonenRadius = $state(untrack(() => zoneMitteRadius));
  let aktuellesZentrum = $state<[number, number]>(untrack(() => zoneMitte));
  let faehigkeitenAktiv = $state(false);
  let testModus = $state(false);

  onMount(() => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${spielCode}`;
    void QRCode.toDataURL(shareUrl, {
        margin: 2,
        color: {
          dark: '#0a0a0c',
          light: '#f2f2ee'
        },
        width: 280
      }).then((url) => (qrDataUrl = url)).catch((e) => {
        console.error('QR-Code Generierung fehlgeschlagen', e);
      });

    const abmelden = spielNetz.abonnieren((nachricht) => {
      if (nachricht.typ === 'zustand') {
        const daten = nachricht.daten as Record<string, any>;
        if (daten.code !== spielCode) return;
        spielVerbindungAktiv = true;
        verbindungsFehler = '';
        modus = daten.modus || modus;
        onmoduswechsel?.(modus);
        const einstellungen = daten.einstellungen || {};
        if (einstellungen.dauerMinuten) spieldauer = einstellungen.dauerMinuten;
        if (einstellungen.versteckZeitMinuten) versteckzeit = einstellungen.versteckZeitMinuten;
        if (einstellungen.pingIntervallMinuten) pingIntervall = einstellungen.pingIntervallMinuten;
        if (einstellungen.zonenRadiusStartMeter) zonenRadius = einstellungen.zonenRadiusStartMeter;
        if (typeof einstellungen.faehigkeitenAktiv === 'boolean') faehigkeitenAktiv = einstellungen.faehigkeitenAktiv;
        if (typeof einstellungen.testModus === 'boolean') testModus = einstellungen.testModus;
        spieler = Object.values(daten.spieler || {}).map((eintrag: any) => ({
          id: eintrag.id,
          name: eintrag.spitzname || 'Spieler',
          rolle: eintrag.rolle || 'gejagt',
          istHost: Boolean(eintrag.istHost),
          istIch: eintrag.id === spielerId,
          gpsBereit: Boolean(eintrag.online)
        }));

        if (daten.phase && daten.phase !== 'lobby') {
          onstart?.({ modus: daten.modus || modus, rolle: rolleFuerSpiel(eigeneRolle()) });
        }
      } else if (nachricht.typ === 'fehler') {
        verbindungsFehler = nachricht.daten?.nachricht || 'Verbindung zum Spielserver fehlgeschlagen.';
      }
    });

    if (spielCode && spielerId && token) {
      spielNetz.verbinden('', spielCode, spielerId, token);
      spielNetz.sendHallo(spielerName, 'circle', '#ff5c00');
      // Beim (Wieder-)Einstieg nur Modus und Zone senden: die Einstellungen liegen bereits am Server
      // und kommen mit dem nächsten Zustand zurück. Sonst überschreiben die Standardwerte die Wahl des Hosts.
      sendeZone();
    } else {
      verbindungsFehler = 'Die sichere Spielsitzung fehlt. Bitte tritt dem Spiel erneut bei.';
    }

    if (istHost && !zoneManuell && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        aktuellesZentrum = [position.coords.longitude, position.coords.latitude];
        zoneBereit = true;
        verbindungsFehler = '';
        onZoneMitteAendern?.(aktuellesZentrum);
        sendeZone();
      }, () => {
        verbindungsFehler = 'Standort nicht verfügbar. Passe die Spielzone vor dem Start manuell an.';
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    }

    const statusTimer = window.setInterval(() => {
      spielVerbindungAktiv = spielVerbindungAktiv && spielNetz.status === 'verbunden';
    }, 500);

    return () => {
      window.clearInterval(statusTimer);
      abmelden();
      spielNetz.trennen();
    };
  });

  function rolleFuerSpiel(rolle: string): string {
    if (rolle === 'mrx' || rolle === 'detektiv') return rolle;
    if (rolle === 'zombie' || rolle === 'mensch') return rolle === 'zombie' ? 'zombie' : 'hider';
    return rolle === 'seeker' ? 'seeker' : 'hider';
  }

  function eigeneRolle(): string {
    return spieler.find((s) => s.istIch)?.rolle || (istHost ? (modus === 'mrx' ? 'mrx' : modus === 'zombie' ? 'zombie' : 'seeker') : 'hider');
  }

  function baueEinstellungen() {
    return {
      dauerMinuten: Number(spieldauer),
      versteckZeitMinuten: Number(versteckzeit),
      pingIntervallMinuten: Number(pingIntervall),
      zonenRadiusStartMeter: Number(zonenRadius),
      faehigkeitenAktiv,
      testModus
    };
  }

  function baueSetupDaten() {
    return {
      modus,
      einstellungen: baueEinstellungen(),
      zoneMittelpunkt: { lng: aktuellesZentrum[0], lat: aktuellesZentrum[1] },
      zonenStufen,
      radiusFaktor,
      zonenRadiusStartMeter: Number(zonenRadius)
    };
  }

  function sendeZone() {
    if (!istHost) return;
    const { einstellungen: _einstellungen, ...nurZone } = baueSetupDaten();
    spielNetz.sendHost('setup', nurZone);
  }

  function synchronisiereEinstellungen() {
    if (istHost) spielNetz.sendHost('setup', baueSetupDaten());
  }

  function kopiereCode() {
    navigator.clipboard?.writeText(spielCode).then(() => {
      codeKopiert = true;
      setTimeout(() => (codeKopiert = false), 2000);
    }).catch(() => {
      codeKopiert = false;
    });
  }

  function teileLink() {
    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${spielCode}`;
    if (navigator.share) {
      navigator.share({
        title: 'Tritt meiner HUNTING-Jagd bei!',
        text: `Spielcode: ${spielCode}`,
        url: shareUrl
      });
    } else {
      kopiereCode();
    }
  }

  function waehlePreset(id: string) {
    gewaehltesPreset = id;
    const p = presets.find(x => x.id === id);
    if (p) {
      spieldauer = p.dauer;
      versteckzeit = p.versteck;
      pingIntervall = p.ping;
      zonenRadius = p.radius;
      onZoneRadiusAendern?.(p.radius);
      synchronisiereEinstellungen();
    }
  }

  function waehleModus(id: 'klassisch' | 'zombie' | 'mrx') {
    modus = id;
    onmoduswechsel?.(id);
    synchronisiereEinstellungen();
  }

  let jaegerGruppe = $derived(spieler.filter(s => ['seeker', 'jaeger', 'zombie', 'detektiv'].includes(s.rolle)));
  let gejagtGruppe = $derived(spieler.filter(s => ['hider', 'gejagt', 'mensch', 'mrx'].includes(s.rolle)));
  // Balance: Ping/Vorsprung passend zur Zone und Teamverhältnis (nur Hinweis, Start bleibt erlaubt)
  const TEAM_PROBLEME = ['team_leer', 'zu_wenige_faenger', 'zu_viele_faenger'];
  let balance = $derived(pruefeBalance({
    zonenRadiusMeter: Number(zonenRadius),
    pingIntervallMinuten: Number(pingIntervall),
    versteckZeitMinuten: Number(versteckzeit),
    dauerMinuten: Number(spieldauer),
    zonenStufen,
    modus,
    faenger: jaegerGruppe.length,
    gejagt: gejagtGruppe.length
  }));
  let zeitProbleme = $derived(balance.probleme.filter((p) => !TEAM_PROBLEME.includes(p.art)));
  // Im Testmodus füllen Bots die Gegenseite auf, das Teamverhältnis ist dann egal.
  let teamProbleme = $derived(testModus ? [] : balance.probleme.filter((p) => TEAM_PROBLEME.includes(p.art)));
  let faengerName = $derived(modus === 'mrx' ? 'Detektive' : modus === 'zombie' ? 'Zombies' : 'Jäger');

  function uebernehmeEmpfehlung() {
    spieldauer = balance.empfehlung.dauerMinuten;
    versteckzeit = balance.empfehlung.versteckZeitMinuten;
    pingIntervall = balance.empfehlung.pingIntervallMinuten;
    gewaehltesPreset = '';
    synchronisiereEinstellungen();
  }

  function verteileTeamsAutomatisch() {
    if (!istHost || !balance.empfohleneFaenger) return;
    spielNetz.sendHost('teams_auto', { faenger: balance.empfohleneFaenger });
  }

  function wechsleTeam(s: LobbySpieler) {
    if (!istHost) return;
    const istFaenger = ['seeker', 'zombie', 'detektiv'].includes(s.rolle);
    spielNetz.sendHost('team', { zielId: s.id, seite: istFaenger ? 'gejagt' : 'faenger' });
  }

  let ichSpieler = $derived(spieler.find(s => s.istIch));
  let mindestSpieler = $derived(testModus ? 1 : 2);
  let onlineSpielerAnzahl = $derived(spieler.filter((s) => s.gpsBereit).length);
</script>

<div class="lobby-screen">
  <!-- Obere Steuerleiste -->
  <header class="lobby-header">
    <button class="schliessen-btn" onclick={onverlassen} aria-label="Lobby verlassen">
      <Icon name="x" size={20} />
    </button>
    <div class="header-titel">SPIEL-LOBBY</div>
    <button class="einstellungen-btn" onclick={() => (settingsSheetOffen = true)} aria-label="Einstellungen">
      <Icon name="settings" size={20} />
    </button>
  </header>

  <main class="lobby-main">
    <!-- Code-Hero: Riesenlettern in Monospace nach Plan §8 -->
    <section class="code-karte deckend">
      <div class="code-beschriftung">SPIELCODE</div>
      <div class="code-anzeige tabular-nums">{spielCode}</div>

      <div class="code-aktionen">
        <GlasKnopf variante="sekundaer" groesse="sm" onclick={kopiereCode}>
          <Icon name={codeKopiert ? 'check' : 'copy'} size={16} />
          <span>{codeKopiert ? 'Kopiert!' : 'Kopieren'}</span>
        </GlasKnopf>
        <GlasKnopf variante="sekundaer" groesse="sm" onclick={() => (qrSheetOffen = true)}>
          <Icon name="qr" size={16} />
          <span>QR-Code</span>
        </GlasKnopf>
        <GlasKnopf variante="sekundaer" groesse="sm" onclick={teileLink}>
          <Icon name="share" size={16} />
          <span>Teilen</span>
        </GlasKnopf>
      </div>
    </section>

    {#if verbindungsFehler}
      <p class="lobby-hinweis fehler" role="alert">{verbindungsFehler}</p>
    {:else if !spielVerbindungAktiv}
      <p class="lobby-hinweis" role="status">Verbinde sicher mit dem Spielserver …</p>
    {/if}

    {#if istHost && (zeitProbleme.length > 0 || teamProbleme.length > 0)}
      <section class="balance-warnung" role="status">
        <div class="balance-titel">
          <Icon name="alert-triangle" size={16} />
          <span>Die Runde ist so nicht ausgewogen</span>
        </div>
        <ul>
          {#each [...teamProbleme, ...zeitProbleme] as problem (problem.art)}
            <li>{problem.text}</li>
          {/each}
        </ul>
        <div class="balance-aktionen">
          {#if teamProbleme.length > 0 && balance.empfohleneFaenger}
            <GlasKnopf variante="sekundaer" groesse="sm" onclick={verteileTeamsAutomatisch}>
              <span>Teams verteilen ({balance.empfohleneFaenger} {faengerName})</span>
            </GlasKnopf>
          {/if}
          {#if zeitProbleme.length > 0}
            <GlasKnopf variante="sekundaer" groesse="sm" onclick={uebernehmeEmpfehlung}>
              <span>Zeiten anpassen ({balance.empfehlung.pingIntervallMinuten} Min. Ping)</span>
            </GlasKnopf>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Modus-Wahl (Große, kontrastreiche Flächen) -->
    <section class="modus-sektion">
      <div class="sektion-kopf">
        <span class="sektion-titel">MODUS</span>
      </div>

      <div class="modus-gitter">
        <button
          class="modus-karte {modus === 'klassisch' ? 'ist-aktiv' : ''}"
          disabled={!istHost}
          onclick={() => waehleModus('klassisch')}
        >
          <div class="modus-name">Klassisch</div>
          <div class="modus-desc">Seeker vs. Hider mit Zonen und Radar-Pings</div>
        </button>

        <button
          class="modus-karte {modus === 'zombie' ? 'ist-aktiv' : ''}"
          disabled={!istHost}
          onclick={() => waehleModus('zombie')}
        >
          <div class="modus-name">Zombie</div>
          <div class="modus-desc">Gefangene verwandeln sich in Zombies</div>
        </button>

        <button
          class="modus-karte {modus === 'mrx' ? 'ist-aktiv' : ''}"
          disabled={!istHost}
          onclick={() => waehleModus('mrx')}
        >
          <div class="modus-name">Mr. X</div>
          <div class="modus-desc">ÖPNV-Jagd mit Bus-, Bahn- und Black-Tickets</div>
        </button>
      </div>
    </section>

    <!-- Rollenverteilung (Deckende Flächen für Tabellen/Listen) -->
    <section class="spieler-sektion">
      <div class="sektion-kopf">
        <span class="sektion-titel">SPIELER ({spieler.length}) · {onlineSpielerAnzahl} ONLINE</span>
      </div>

      <div class="team-spalten">
        <!-- Team Jäger -->
        <div class="team-spalte">
          <div class="team-kopf kopf-jaeger">
            <span>{modus === 'mrx' ? 'DETEKTIVE' : modus === 'zombie' ? 'ZOMBIES' : 'JÄGER'} ({jaegerGruppe.length})</span>
          </div>
          <div class="team-liste">
            {#each jaegerGruppe as s (s.id)}
              <button
                type="button"
                class="spieler-eintrag"
                disabled={!istHost}
                title={istHost ? 'Antippen, um das Team zu wechseln' : undefined}
                onclick={() => wechsleTeam(s)}
              >
                <div class="spieler-avatar avatar-jaeger"></div>
                <span class="spieler-name">{s.name}</span>
                {#if s.istIch || s.istHost}
                  <span class="spieler-marke">{s.istIch ? 'Du' : ''}{s.istIch && s.istHost ? ' · ' : ''}{s.istHost ? 'Host' : ''}</span>
                {/if}
                <span class="verbindungs-punkt" class:getrennt={!s.gpsBereit} title={s.gpsBereit ? 'Verbunden' : 'Getrennt'} aria-label={s.gpsBereit ? 'Verbunden' : 'Getrennt'}></span>
              </button>
            {/each}
            {#if jaegerGruppe.length === 0}
              <div class="leer-hinweis">Warte auf Spieler …</div>
            {/if}
          </div>
        </div>

        <!-- Team Gejagt -->
        <div class="team-spalte">
          <div class="team-kopf kopf-gejagt">
            <span>{modus === 'mrx' ? 'MR. X' : modus === 'zombie' ? 'MENSCHEN' : 'GEJAGTE'} ({gejagtGruppe.length})</span>
          </div>
          <div class="team-liste">
            {#each gejagtGruppe as s (s.id)}
              <button
                type="button"
                class="spieler-eintrag"
                disabled={!istHost}
                title={istHost ? 'Antippen, um das Team zu wechseln' : undefined}
                onclick={() => wechsleTeam(s)}
              >
                <div class="spieler-avatar avatar-gejagt"></div>
                <span class="spieler-name">{s.name}</span>
                {#if s.istIch || s.istHost}
                  <span class="spieler-marke">{s.istIch ? 'Du' : ''}{s.istIch && s.istHost ? ' · ' : ''}{s.istHost ? 'Host' : ''}</span>
                {/if}
                <span class="verbindungs-punkt" class:getrennt={!s.gpsBereit} title={s.gpsBereit ? 'Verbunden' : 'Getrennt'} aria-label={s.gpsBereit ? 'Verbunden' : 'Getrennt'}></span>
              </button>
            {/each}
            {#if gejagtGruppe.length === 0}
              <div class="leer-hinweis">Warte auf Spieler …</div>
            {/if}
          </div>
        </div>
      </div>
      {#if istHost && spieler.length >= 2}
        <p class="team-hinweis">Tippe auf einen Spieler, um sein Team zu wechseln.</p>
      {/if}
    </section>
  </main>

  <!-- Untere Kapsel: Starten & Zonen-Editor -->
  <footer class="lobby-footer">
    <div class="footer-kapsel-wrapper">
      <GlasKapsel variante="panel" klasse="footer-panel">
        <div class="footer-zeile">
          <GlasKnopf variante="sekundaer" groesse="lg" deaktiviert={!istHost} onclick={onzoneneditor}>
            <Icon name="layers" size={20} />
            <span>Zone</span>
          </GlasKnopf>

          <GlasKnopf
            variante="primaer"
            groesse="lg"
            breit={true}
            deaktiviert={!istHost || !spielVerbindungAktiv || (zoneBereit && onlineSpielerAnzahl < mindestSpieler)}
            onclick={() => {
              if (!istHost || !spielVerbindungAktiv) return;
              if (!zoneBereit) {
                onzoneneditor?.();
                return;
              }
              if (onlineSpielerAnzahl >= mindestSpieler) onstart?.({ modus, rolle: rolleFuerSpiel(eigeneRolle()) });
            }}
          >
            <span>{!istHost ? 'Warte auf Host' : !spielVerbindungAktiv ? 'Verbinde …' : !zoneBereit ? 'Zone festlegen' : onlineSpielerAnzahl < mindestSpieler ? 'Warte auf Mitspieler' : testModus ? 'Test starten' : 'Jagd starten'}</span>
            <Icon name="arrow-right" size={20} color="#0a0a0c" />
          </GlasKnopf>
        </div>
      </GlasKapsel>
    </div>
  </footer>

  <!-- QR-Code Sheet -->
  <Sheet offen={qrSheetOffen} titel="QR-Code zum Scannen" onclose={() => (qrSheetOffen = false)}>
    <div class="qr-inhalt">
      {#if qrDataUrl}
        <img src={qrDataUrl} alt="Spielcode QR" class="qr-bild" />
      {/if}
      <p class="qr-hinweis">Mitspieler können diesen Code direkt mit der Kamera scannen, um der Lobby beizutreten.</p>
    </div>
  </Sheet>

  <!-- Einstellungen & Presets Sheet -->
  <Sheet offen={settingsSheetOffen} titel="Spieleinstellungen" onclose={() => (settingsSheetOffen = false)}>
    <div class="einstellungen-formular">
      <div class="preset-buttons">
        {#each presets as p}
          <button
            class="preset-btn {gewaehltesPreset === p.id ? 'ist-gewaehlt' : ''}"
            disabled={!istHost}
            onclick={() => waehlePreset(p.id)}
          >
            {p.name}
          </button>
        {/each}
      </div>

      <div class="slider-gruppe">
        <label for="spieldauer" class="slider-label">
          <span>Spieldauer</span>
          <span class="wert tabular-nums">{spieldauer} Min.</span>
        </label>
        <input id="spieldauer" type="range" min="10" max="240" step="5" bind:value={spieldauer} onchange={synchronisiereEinstellungen} disabled={!istHost} />
      </div>

      <div class="slider-gruppe">
        <label for="versteckzeit" class="slider-label">
          <span>Versteckzeit (Vorsprung)</span>
          <span class="wert tabular-nums">{versteckzeit} Min.</span>
        </label>
        <input id="versteckzeit" type="range" min="1" max="30" step="1" bind:value={versteckzeit} onchange={synchronisiereEinstellungen} disabled={!istHost} />
        <span class="slider-hinweis">Passend für {zonenRadius} m Zone: {balance.versteckBereich[0]}–{balance.versteckBereich[1]} Min.</span>
      </div>

      <div class="slider-gruppe">
        <label for="pingintervall" class="slider-label">
          <span>Ping-Intervall</span>
          <span class="wert tabular-nums">{pingIntervall} Min.</span>
        </label>
        <input id="pingintervall" type="range" min="1" max="30" step="1" bind:value={pingIntervall} onchange={synchronisiereEinstellungen} disabled={!istHost} />
        <span class="slider-hinweis">Passend für {zonenRadius} m Zone: {balance.pingBereich[0]}–{balance.pingBereich[1]} Min.</span>
      </div>

      {#if istHost}
        <GlasKnopf variante="sekundaer" groesse="md" breit={true} onclick={uebernehmeEmpfehlung}>
          <span>Passend zur Zone einstellen</span>
        </GlasKnopf>
      {/if}

      <div class="schalter-gruppe">
        <span class="schalter-text">Fähigkeiten & Loot aktivieren</span>
        <input type="checkbox" bind:checked={faehigkeitenAktiv} class="toggle-checkbox" onchange={synchronisiereEinstellungen} disabled={!istHost} />
      </div>

      <div class="schalter-gruppe">
        <span class="schalter-text">
          Testmodus
          <span class="schalter-unterzeile">Allein starten mit 3 Bots, bewegen per Tipp auf die Karte</span>
        </span>
        <input type="checkbox" bind:checked={testModus} class="toggle-checkbox" onchange={synchronisiereEinstellungen} disabled={!istHost} />
      </div>

      <div class="zonen-link-box">
        <GlasKnopf variante="sekundaer" groesse="md" breit={true} onclick={() => { settingsSheetOffen = false; onzoneneditor?.(); }}>
          <Icon name="map-pin" size={18} />
          <span>Zone auf Karte anpassen</span>
        </GlasKnopf>
      </div>
    </div>
  </Sheet>
</div>

<style>
  .lobby-screen {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--grund);
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)) 16px;
    overflow-y: auto;
  }

  .lobby-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
  }

  .header-titel {
    font-family: var(--font-headline);
    font-size: 0.9375rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--tinte);
  }

  .schliessen-btn, .einstellungen-btn {
    background: var(--flaeche-erhoeht);
    border: 1px solid var(--flaeche-rand);
    border-radius: 50%;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tinte-2);
    cursor: pointer;
    transition: transform var(--zeit-schnell) var(--feder-aus);
  }
  .schliessen-btn:active, .einstellungen-btn:active {
    transform: scale(0.92);
  }

  .lobby-main {
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
    padding-bottom: 100px;
  }

  /* Code-Karte: deckend nach Liquid Glass Regel */
  .code-karte.deckend {
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-l);
    padding: 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .code-beschriftung {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--tinte-2);
  }

  .code-anzeige {
    font-family: var(--font-mono);
    font-size: clamp(2.4rem, 8vw, 3.6rem);
    font-weight: 700;
    letter-spacing: 0.25em;
    color: var(--akzent);
    line-height: 1;
  }

  .code-aktionen {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .sektion-kopf {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .sektion-titel {
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--tinte-2);
  }

  /* Modus Gitter */
  .modus-gitter {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .modus-karte {
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-m);
    padding: 14px 12px;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--zeit-schnell) ease-out, background-color var(--zeit-schnell) ease-out;
  }
  .modus-karte.ist-aktiv {
    border-color: var(--akzent);
    background: var(--flaeche-erhoeht);
  }

  .modus-name {
    font-family: var(--font-headline);
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--tinte);
    margin-bottom: 4px;
  }

  .modus-desc {
    font-size: 0.6875rem;
    color: var(--tinte-2);
    line-height: 1.3;
  }

  /* Team-Spalten */
  .team-spalten {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .team-spalte {
    min-width: 0;
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-m);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .team-kopf {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .kopf-jaeger { color: var(--rolle-jaeger); }
  .kopf-gejagt { color: var(--rolle-gejagt); }

  .team-liste {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .spieler-eintrag {
    width: 100%;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--flaeche-erhoeht);
    border-radius: var(--radius-s);
    cursor: pointer;
    user-select: none;
    transition: transform var(--zeit-schnell) var(--feder-aus);
  }
  .spieler-eintrag:disabled {
    cursor: default;
  }

  .spieler-eintrag:active:not(:disabled) {
    transform: scale(0.97);
  }

  .spieler-avatar {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
  .avatar-jaeger {
    background: var(--rolle-jaeger);
    transform: rotate(45deg);
  }
  .avatar-gejagt {
    background: var(--rolle-gejagt);
    border-radius: 50%;
  }

  .spieler-name {
    flex: 1;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--tinte);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .balance-warnung {
    background: rgba(255, 92, 0, 0.08);
    border: 1px solid rgba(255, 92, 0, 0.45);
    border-radius: var(--radius-m);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .balance-titel {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--akzent);
  }

  .balance-warnung ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8125rem;
    color: var(--tinte);
    line-height: 1.4;
  }

  .balance-aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .team-hinweis {
    margin: 8px 0 0;
    font-size: 0.75rem;
    color: var(--tinte-3);
    text-align: center;
  }

  .slider-hinweis {
    font-size: 0.75rem;
    color: var(--tinte-2);
  }

  .spieler-marke {
    flex: none;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--tinte-2);
  }

  .verbindungs-punkt {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: #00e599;
    box-shadow: 0 0 8px rgba(0, 229, 153, 0.35);
  }

  .verbindungs-punkt.getrennt {
    background: #777780;
    box-shadow: none;
  }

  .lobby-hinweis {
    margin: 0;
    color: var(--tinte-2);
    font-size: 0.8rem;
    text-align: center;
  }

  .lobby-hinweis.fehler {
    color: var(--rolle-jaeger);
  }

  .leer-hinweis {
    font-size: 0.75rem;
    color: var(--tinte-3);
    font-style: italic;
    padding: 8px 0;
  }

  /* Footer & Schwebende Kapsel */
  .lobby-footer {
    position: fixed;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 16px;
    right: 16px;
    z-index: 100;
    display: flex;
    justify-content: center;
  }

  .footer-kapsel-wrapper {
    width: 100%;
    max-width: 460px;
  }

  :global(.footer-panel) {
    padding: 10px 14px !important;
  }

  .footer-zeile {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  /* Auf schmalen Handys muss der Start-Knopf schrumpfen statt die Leiste zu sprengen. */
  .footer-zeile :global(.glas-knopf) {
    padding: 0 16px;
    font-size: 1rem;
  }

  .footer-zeile :global(.glas-knopf:not(.ist-breit)) {
    flex: none;
  }

  .footer-zeile :global(.ist-breit) {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
  }

  .footer-zeile :global(.ist-breit span) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* QR Modal */
  .qr-inhalt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
  }
  .qr-bild {
    border-radius: var(--radius-m);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .qr-hinweis {
    font-size: 0.875rem;
    color: var(--tinte-2);
  }

  /* Einstellungen Sheet */
  .einstellungen-formular {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .preset-btn {
    background: var(--flaeche-erhoeht);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-s);
    color: var(--tinte-2);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 8px 4px;
    cursor: pointer;
  }
  .preset-btn.ist-gewaehlt {
    border-color: var(--akzent);
    color: var(--tinte);
    background: rgba(255, 92, 0, 0.12);
  }

  .slider-gruppe {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    color: var(--tinte);
  }
  .wert {
    color: var(--akzent);
    font-weight: 700;
  }

  input[type='range'] {
    accent-color: var(--akzent);
    height: 6px;
    cursor: pointer;
  }

  .schalter-gruppe {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }

  .schalter-text {
    font-size: 0.875rem;
    color: var(--tinte);
  }

  .schalter-unterzeile {
    display: block;
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--tinte-2);
  }

  .toggle-checkbox {
    width: 22px;
    height: 22px;
    accent-color: var(--akzent);
    cursor: pointer;
  }

  .zonen-link-box {
    margin-top: 6px;
  }
</style>
