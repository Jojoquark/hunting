<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import GlasKnopf from '../lib/ui/GlasKnopf.svelte';
  import GlasKapsel from '../lib/ui/GlasKapsel.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';

  export interface LobbySpieler {
    id: string;
    name: string;
    rolle: 'jaeger' | 'gejagt' | 'zombie';
    istHost: boolean;
    istIch: boolean;
    gpsBereit: boolean;
  }

  interface Props {
    spielCode?: string;
    istHost?: boolean;
    spielerListe?: LobbySpieler[];
    onstart?: (daten?: { modus: string; rolle: string }) => void;
    onverlassen?: () => void;
    onzoneneditor?: () => void;
  }

  let {
    spielCode = 'HNT-782',
    istHost = true,
    spielerListe = [
      { id: '1', name: 'Jojo (Host)', rolle: 'jaeger', istHost: true, istIch: true, gpsBereit: true },
      { id: '2', name: 'Alex', rolle: 'gejagt', istHost: false, istIch: false, gpsBereit: true },
      { id: '3', name: 'Sarah', rolle: 'gejagt', istHost: false, istIch: false, gpsBereit: true },
      { id: '4', name: 'Lukas', rolle: 'gejagt', istHost: false, istIch: false, gpsBereit: false }
    ],
    onstart,
    onverlassen,
    onzoneneditor
  }: Props = $props();

  let spieler = $state<LobbySpieler[]>([]);
  let initialisiert = false;
  $effect(() => {
    if (!initialisiert) {
      spieler = [...spielerListe];
      initialisiert = true;
    }
  });
  let modus = $state<'klassisch' | 'zombie' | 'mrx'>('klassisch');
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
  let zonenRadius = $state(1000);
  let faehigkeitenAktiv = $state(false);

  onMount(async () => {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?code=${spielCode}`;
      qrDataUrl = await QRCode.toDataURL(shareUrl, {
        margin: 2,
        color: {
          dark: '#0a0a0c',
          light: '#f2f2ee'
        },
        width: 280
      });
    } catch (e) {
      console.error('QR-Code Generierung fehlgeschlagen', e);
    }
  });

  function kopiereCode() {
    navigator.clipboard?.writeText(spielCode);
    codeKopiert = true;
    setTimeout(() => (codeKopiert = false), 2000);
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

  function toggleRolle(id: string) {
    if (!istHost) return;
    spieler = spieler.map(s => {
      if (s.id === id) {
        const neueRolle = s.rolle === 'jaeger' ? 'gejagt' : 'jaeger';
        return { ...s, rolle: neueRolle };
      }
      return s;
    });
  }

  function zufaelligeRollen() {
    if (!istHost) return;
    // Mindestens 1 Jäger, Rest Gejagt
    const shuff = [...spieler].sort(() => Math.random() - 0.5);
    const anzahlJaeger = Math.max(1, Math.floor(shuff.length / 3));
    spieler = spieler.map(s => {
      const index = shuff.findIndex(x => x.id === s.id);
      return {
        ...s,
        rolle: index < anzahlJaeger ? 'jaeger' : 'gejagt'
      };
    });
  }

  function waehlePreset(id: string) {
    gewaehltesPreset = id;
    const p = presets.find(x => x.id === id);
    if (p) {
      spieldauer = p.dauer;
      versteckzeit = p.versteck;
      pingIntervall = p.ping;
      zonenRadius = p.radius;
    }
  }

  let jaegerGruppe = $derived(spieler.filter(s => s.rolle === 'jaeger'));
  let gejagtGruppe = $derived(spieler.filter(s => s.rolle === 'gejagt' || s.rolle === 'zombie'));
  let ichSpieler = $derived(spieler.find(s => s.istIch));
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

    <!-- Modus-Wahl (Große, kontrastreiche Flächen) -->
    <section class="modus-sektion">
      <div class="sektion-kopf">
        <span class="sektion-titel">MODUS</span>
      </div>

      <div class="modus-gitter">
        <button
          class="modus-karte {modus === 'klassisch' ? 'ist-aktiv' : ''}"
          onclick={() => (modus = 'klassisch')}
        >
          <div class="modus-name">Klassisch</div>
          <div class="modus-desc">Seeker vs. Hider mit Zonen und Radar-Pings</div>
        </button>

        <button
          class="modus-karte {modus === 'zombie' ? 'ist-aktiv' : ''}"
          onclick={() => (modus = 'zombie')}
        >
          <div class="modus-name">Zombie</div>
          <div class="modus-desc">Gefangene verwandeln sich in Zombies</div>
        </button>

        <button
          class="modus-karte {modus === 'mrx' ? 'ist-aktiv' : ''}"
          onclick={() => (modus = 'mrx')}
        >
          <div class="modus-name">Mr. X</div>
          <div class="modus-desc">ÖPNV-Jagd mit Bus-, Bahn- und Black-Tickets</div>
        </button>
      </div>
    </section>

    <!-- Rollenverteilung (Deckende Flächen für Tabellen/Listen) -->
    <section class="spieler-sektion">
      <div class="sektion-kopf">
        <span class="sektion-titel">SPIELER ({spieler.length})</span>
        {#if istHost}
          <button class="aktion-link" onclick={zufaelligeRollen}>
            <Icon name="shuffle" size={16} />
            <span>Zufall</span>
          </button>
        {/if}
      </div>

      <div class="team-spalten">
        <!-- Team Jäger -->
        <div class="team-spalte">
          <div class="team-kopf kopf-jaeger">
            <span>JÄGER ({jaegerGruppe.length})</span>
          </div>
          <div class="team-liste">
            {#each jaegerGruppe as s (s.id)}
              <div
                class="spieler-eintrag"
                role="button"
                tabindex="0"
                onclick={() => toggleRolle(s.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleRolle(s.id)}
              >
                <div class="spieler-avatar avatar-jaeger"></div>
                <span class="spieler-name">{s.name} {s.istIch ? '(Du)' : ''}</span>
                {#if s.gpsBereit}
                  <span class="gps-ok" title="GPS aktiv"><Icon name="locate" size={14} /></span>
                {:else}
                  <span class="gps-fehlt" title="GPS fehlt"><Icon name="alert-triangle" size={14} /></span>
                {/if}
              </div>
            {/each}
            {#if jaegerGruppe.length === 0}
              <div class="leer-hinweis">Kein Jäger zugewiesen</div>
            {/if}
          </div>
        </div>

        <!-- Team Gejagt -->
        <div class="team-spalte">
          <div class="team-kopf kopf-gejagt">
            <span>GEJAGT ({gejagtGruppe.length})</span>
          </div>
          <div class="team-liste">
            {#each gejagtGruppe as s (s.id)}
              <div
                class="spieler-eintrag"
                role="button"
                tabindex="0"
                onclick={() => toggleRolle(s.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleRolle(s.id)}
              >
                <div class="spieler-avatar avatar-gejagt"></div>
                <span class="spieler-name">{s.name} {s.istIch ? '(Du)' : ''}</span>
                {#if s.gpsBereit}
                  <span class="gps-ok" title="GPS aktiv"><Icon name="locate" size={14} /></span>
                {:else}
                  <span class="gps-fehlt" title="GPS fehlt"><Icon name="alert-triangle" size={14} /></span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Untere Kapsel: Starten & Zonen-Editor -->
  <footer class="lobby-footer">
    <div class="footer-kapsel-wrapper">
      <GlasKapsel variante="panel" klasse="footer-panel">
        <div class="footer-zeile">
          <GlasKnopf variante="sekundaer" groesse="lg" onclick={onzoneneditor}>
            <Icon name="layers" size={20} />
            <span>Zone</span>
          </GlasKnopf>

          <GlasKnopf
            variante="primaer"
            groesse="lg"
            breit={true}
            deaktiviert={!istHost || jaegerGruppe.length === 0}
            onclick={() => onstart?.({ modus, rolle: ichSpieler?.rolle === 'jaeger' ? 'seeker' : (modus === 'mrx' ? 'mrx' : 'hider') })}
          >
            <span>Jagd starten</span>
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
        <input id="spieldauer" type="range" min="10" max="240" step="5" bind:value={spieldauer} />
      </div>

      <div class="slider-gruppe">
        <label for="versteckzeit" class="slider-label">
          <span>Versteckzeit (Vorsprung)</span>
          <span class="wert tabular-nums">{versteckzeit} Min.</span>
        </label>
        <input id="versteckzeit" type="range" min="1" max="30" step="1" bind:value={versteckzeit} />
      </div>

      <div class="slider-gruppe">
        <label for="pingintervall" class="slider-label">
          <span>Ping-Intervall</span>
          <span class="wert tabular-nums">{pingIntervall} Min.</span>
        </label>
        <input id="pingintervall" type="range" min="1" max="30" step="1" bind:value={pingIntervall} />
      </div>

      <div class="schalter-gruppe">
        <span class="schalter-text">Fähigkeiten & Loot aktivieren</span>
        <input type="checkbox" bind:checked={faehigkeitenAktiv} class="toggle-checkbox" />
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

  .aktion-link {
    background: transparent;
    border: none;
    color: var(--tinte);
    font-size: 0.8125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  /* Modus Gitter */
  .modus-gitter {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .team-spalte {
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
  .spieler-eintrag:active {
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

  .gps-ok { color: #00e599; display: flex; }
  .gps-fehlt { color: var(--rolle-jaeger); display: flex; }

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
    gap: 12px;
    align-items: center;
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
