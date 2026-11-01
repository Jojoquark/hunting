<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { spielNetz } from '../lib/netz/socket';
  import { geoTracker, type GeoPosition } from '../lib/ortung/geolocation';
  import { klang } from '../lib/klang/sound';

  // Props über Svelte 5 $props()
  let {
    spielerId = '',
    spielCode = '',
    rolle = 'hider', // 'seeker' | 'hider' | 'zombie' | 'mrx' | 'detektiv' | 'zuschauer'
    modus = 'klassisch', // 'klassisch' | 'zombie' | 'mrx'
    onGefangen = () => {},
    onSpielEnde = (sieger: string) => {},
  } = $props<{
    spielerId?: string;
    spielCode?: string;
    rolle?: string;
    modus?: string;
    onGefangen?: () => void;
    onSpielEnde?: (sieger: string) => void;
  }>();

  // Reaktivität über Svelte 5 Runes ($state)
  let serverZeit = $state(Date.now());
  let spielZustand = $state<any>({
    phase: 'jagd', // 'verstecken' | 'jagd' | 'ende'
    spielEndeZeit: Date.now() + 3600000,
    naechsterPingZeit: Date.now() + 300000,
    naechsteZoneZeit: Date.now() + 600000,
    fangbar: false,
    fangZielId: null as string | null,
    energie: 65,
    ausserhalbZone: false,
    kulanzSekunden: 60,
    funklochStrafe: false,
    funklochRestSekunden: 0,
    seekerInDerNaehe: false,
    tickets: [] as Array<{ typ: string; zeit: number; linie?: string; haltestelle?: string }>,
    ungeleseneNachrichten: 0,
  });

  let offenesSheet = $state<'keins' | 'faehigkeiten' | 'chat' | 'ticket' | 'qr'>('keins');
  let chatKanal = $state<'alle' | 'team' | 'zuschauer'>('team');
  let chatEingabe = $state('');
  let chatNachrichten = $state<Array<{ von: string; text: string; kanal: string; zeit: number }>>([]);
  
  // Ticket-Formular für Mr. X
  let gewaehltesTicket = $state<'bus' | 'tram' | 'ubahn' | 'sbahn' | 'zug' | 'faehre' | 'black' | 'doppel'>('bus');
  let ticketLinie = $state('');
  let ticketHaltestelle = $state('');
  let haltestellenVorschlaege = $state<string[]>(['Hauptbahnhof (Gleis 1-4)', 'Zentrum / Rathaus', 'Universitätsplatz', 'Stadtpark Nord']);

  // Timer-Loop für synchrone Countdowns
  let timerIntervall: number | null = null;

  // Abgeleitete Werte über $derived
  let restzeitText = $derived.by(() => {
    const diffMs = Math.max(0, spielZustand.spielEndeZeit - serverZeit);
    const m = Math.floor(diffMs / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  let naechsterPingText = $derived.by(() => {
    const diffMs = Math.max(0, spielZustand.naechsterPingZeit - serverZeit);
    const m = Math.floor(diffMs / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  let istMrXModus = $derived(modus === 'mrx');
  let istMrX = $derived(rolle === 'mrx');
  let kannFangen = $derived(rolle === 'seeker' || rolle === 'zombie' || rolle === 'detektiv');

  onMount(() => {
    // 1. Geolocation starten
    geoTracker.starten();
    const unsubGeo = geoTracker.abonnieren((pos: GeoPosition) => {
      spielNetz.sendOrt({
        lat: pos.lat,
        lng: pos.lng,
        genauigkeit: pos.genauigkeit,
        zeit: pos.zeit,
        tempo: pos.tempo,
      });
    });

    // 2. WebSocket Listener
    const unsubNetz = spielNetz.abonnieren((msg) => {
      if (msg.typ === 'zustand') {
        spielZustand = { ...spielZustand, ...msg.daten };
        if (msg.daten.ausserhalbZone !== undefined) {
          geoTracker.setAusserhalbZone(msg.daten.ausserhalbZone);
          if (msg.daten.ausserhalbZone) klang.zonenWarnung();
        }
        if (msg.daten.gefangen) {
          onGefangen();
        }
        if (msg.daten.phase === 'ende') {
          onSpielEnde(msg.daten.sieger || 'Unbekannt');
        }
      } else if (msg.typ === 'ereignis') {
        if (msg.daten.typ === 'ping') {
          klang.radarPing();
        } else if (msg.daten.typ === 'zone') {
          klang.zonenWarnung();
        } else if (msg.daten.typ === 'fangAlarm') {
          klang.fangAlarm();
        } else if (msg.daten.typ === 'chat') {
          chatNachrichten.push(msg.daten);
          if (offenesSheet !== 'chat') {
            spielZustand.ungeleseneNachrichten++;
          }
        }
      }
    });

    // 3. Countdown Refresh
    timerIntervall = window.setInterval(() => {
      serverZeit = spielNetz.getAktuelleServerZeit();
    }, 500);

    return () => {
      unsubGeo();
      unsubNetz();
      if (timerIntervall) clearInterval(timerIntervall);
    };
  });

  function triggerFangen() {
    klang.klick();
    if (!spielZustand.fangZielId) return;
    spielNetz.sendFangen(spielZustand.fangZielId);
  }

  function loeseFaehigkeit(id: string) {
    klang.abilityTrigger();
    spielNetz.sendFaehigkeit(id);
    offenesSheet = 'keins';
  }

  function sendeTicket() {
    klang.ticketGong();
    spielNetz.sendTicket({
      verkehrsmittel: gewaehltesTicket,
      linie: ticketLinie.trim() || undefined,
      haltestelle: ticketHaltestelle.trim() || undefined,
    });
    ticketLinie = '';
    ticketHaltestelle = '';
    offenesSheet = 'keins';
  }

  function sendeChatNachricht(text: string) {
    if (!text.trim()) return;
    spielNetz.sendChat(chatKanal, text.trim());
    chatNachrichten.push({
      von: 'Ich',
      text: text.trim(),
      kanal: chatKanal,
      zeit: Date.now(),
    });
    chatEingabe = '';
  }
</script>

<div class="hud-overlay">
  <!-- 1. OBERE SCHWEBENDE GLASKAPSEL -->
  <header class="glas-container kopf-leiste">
    <div class="kapsel-segment phase">
      <span class="puls-punkt" class:aktiv={spielZustand.phase === 'jagd'}></span>
      <span class="phase-text">{de.hud.phase[spielZustand.phase as keyof typeof de.hud.phase] || 'Jagd'}</span>
    </div>

    <div class="kapsel-segment timer-zentral">
      <span class="label">{de.hud.timer.restzeit}</span>
      <span class="zeit">{restzeitText}</span>
    </div>

    <div class="kapsel-segment ping-timer">
      <span class="label">{de.hud.timer.naechsterPing}</span>
      <span class="zeit">{naechsterPingText}</span>
    </div>

    <button
      type="button"
      class="icon-knopf"
      title={geoTracker.wakeLockAktiv ? de.ortung.wakeLockAktiv : de.ortung.wakeLockInaktiv}
      onclick={() => geoTracker.toggleWakeLock()}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    </button>
  </header>

  <!-- 2. WARNUNGEN (ZONENVERLASS / FUNKLOCH / GEGNER NÄHE) -->
  {#if spielZustand.ausserhalbZone}
    <div class="warn-banner zone-warnung">
      <div class="warn-titel">{de.hud.warnungen.zoneVerlassenTitel}</div>
      <div class="warn-text">{de.hud.warnungen.zoneVerlassenText}</div>
      <div class="warn-kulanz">{de.hud.warnungen.zoneKulanz.replace('%s', spielZustand.kulanzSekunden.toString())}</div>
    </div>
  {:else if spielZustand.seekerInDerNaehe && (rolle === 'hider' || rolle === 'mrx')}
    <div class="warn-banner seeker-warnung">
      <div class="warn-titel">{de.hud.warnungen.seekerNahTitel}</div>
      <div class="warn-text">{de.hud.warnungen.seekerNahText}</div>
    </div>
  {/if}

  <!-- 3. MR. X FAHRTENTAFEL (Nur in Mr. X Modus) -->
  {#if istMrXModus}
    <div class="glas-container mrx-board">
      <div class="board-titel">{de.mrx.fahrtentafel}</div>
      <div class="ticket-leiste">
        {#each spielZustand.tickets as t, i}
          <div class="ticket-badge" class:black={t.typ === 'black'}>
            <span class="ticket-nr">#{i + 1}</span>
            <span class="ticket-typ">{de.mrx.verkehrsmittel[t.typ as keyof typeof de.mrx.verkehrsmittel] || t.typ}</span>
            {#if t.linie}
              <span class="ticket-linie">{t.linie}</span>
            {/if}
          </div>
        {:else}
          <div class="ticket-leer">Noch keine Fahrten eingetragen</div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 4. UNTERE SCHWEBENDE AKTIONSKAPSEL -->
  <footer class="glas-container aktions-kapsel">
    {#if kannFangen}
      <button
        type="button"
        class="aktions-knopf fangen"
        class:bereit={spielZustand.fangbar}
        disabled={!spielZustand.fangbar}
        onclick={triggerFangen}
      >
        <span class="fang-symbol">⚡</span>
        <span class="fang-text">{de.hud.aktionen.fangen}</span>
      </button>
    {/if}

    {#if istMrX}
      <button
        type="button"
        class="aktions-knopf ticket"
        onclick={() => (offenesSheet = 'ticket')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="20" height="12" x="2" y="6" rx="2"/>
          <path d="M12 12h.01M17 12h.01M7 12h.01"/>
        </svg>
        <span>{de.hud.aktionen.ticket}</span>
      </button>
    {/if}

    <button
      type="button"
      class="aktions-knopf sekundar"
      onclick={() => (offenesSheet = 'faehigkeiten')}
    >
      <div class="energie-badge">{spielZustand.energie}⚡</div>
      <span>{de.hud.aktionen.faehigkeiten}</span>
    </button>

    <button
      type="button"
      class="aktions-knopf sekundar chat-toggle"
      onclick={() => {
        offenesSheet = 'chat';
        spielZustand.ungeleseneNachrichten = 0;
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      {#if spielZustand.ungeleseneNachrichten > 0}
        <span class="chat-badge">{spielZustand.ungeleseneNachrichten}</span>
      {/if}
      <span>{de.hud.aktionen.chat}</span>
    </button>
  </footer>

  <!-- 5. SHEETS (FÄHIGKEITEN / CHAT / TICKET) -->
  {#if offenesSheet !== 'keins'}
    <div
      class="sheet-backdrop"
      onclick={() => (offenesSheet = 'keins')}
      onkeydown={(e) => e.key === 'Escape' && (offenesSheet = 'keins')}
      role="button"
      tabindex="0"
    ></div>

    <div class="glas-container sheet-inhalt" role="dialog" aria-modal="true">
      <div class="sheet-griff"></div>

      <!-- A. FÄHIGKEITEN-SHEET -->
      {#if offenesSheet === 'faehigkeiten'}
        <div class="sheet-kopf">
          <h3>{de.faehigkeiten.titel}</h3>
          <span class="energie-anzeige">Energie: {spielZustand.energie}/100 ⚡</span>
        </div>
        <div class="faehigkeiten-liste">
          {#each Object.entries(de.faehigkeiten.katalog) as [id, f]}
            <div class="faehigkeit-karte">
              <div class="faehigkeit-info">
                <h4>{f.name}</h4>
                <p>{f.beschreibung}</p>
              </div>
              <button
                type="button"
                class="knopf-aktivieren"
                onclick={() => loeseFaehigkeit(id)}
              >
                Zünden
              </button>
            </div>
          {/each}
        </div>

      <!-- B. CHAT-SHEET -->
      {:else if offenesSheet === 'chat'}
        <div class="sheet-kopf">
          <h3>{de.chat.titel}</h3>
          <div class="kanal-waehler">
            <button
              class:aktiv={chatKanal === 'team'}
              onclick={() => (chatKanal = 'team')}
            >{de.chat.kanaele.team}</button>
            <button
              class:aktiv={chatKanal === 'alle'}
              onclick={() => (chatKanal = 'alle')}
            >{de.chat.kanaele.alle}</button>
          </div>
        </div>

        <div class="chat-verlauf">
          {#each chatNachrichten as m}
            <div class="chat-zeile" class:eigene={m.von === 'Ich'}>
              <span class="chat-autor">{m.von}:</span>
              <span class="chat-text">{m.text}</span>
            </div>
          {:else}
            <div class="chat-leer">Noch keine Nachrichten. Nutze den Schnellfunk!</div>
          {/each}
        </div>

        <!-- Schnellnachrichten Chips -->
        <div class="schnellfunk-chips">
          {#each de.chat.schnellnachrichten as s}
            <button
              type="button"
              class="chip"
              onclick={() => sendeChatNachricht(s)}
            >
              {s}
            </button>
          {/each}
        </div>

        <form class="chat-form" onsubmit={(e) => { e.preventDefault(); sendeChatNachricht(chatEingabe); }}>
          <input
            type="text"
            bind:value={chatEingabe}
            placeholder={de.chat.nachrichtSenden}
            maxlength="200"
          />
          <button type="submit">Senden</button>
        </form>

      <!-- C. MR. X TICKET-SHEET -->
      {:else if offenesSheet === 'ticket'}
        <div class="sheet-kopf">
          <h3>{de.mrx.ticketWaehlen}</h3>
        </div>

        <div class="ticket-raster">
          {#each (['bus', 'tram', 'ubahn', 'sbahn', 'zug', 'faehre', 'black', 'doppel'] as const) as t}
            <button
              type="button"
              class="ticket-option"
              class:gewaehlt={gewaehltesTicket === t}
              onclick={() => (gewaehltesTicket = t)}
            >
              <span class="t-name">{de.mrx.verkehrsmittel[t]}</span>
            </button>
          {/each}
        </div>

        <div class="ticket-eingaben">
          <input
            type="text"
            bind:value={ticketLinie}
            placeholder={de.mrx.linieOptional}
            class="eingabe-feld"
          />
          <input
            type="text"
            bind:value={ticketHaltestelle}
            placeholder="Haltestelle / Station"
            class="eingabe-feld"
          />
          <div class="vorschlag-liste">
            {#each haltestellenVorschlaege as v}
              <button
                type="button"
                class="vorschlag-item"
                onclick={() => (ticketHaltestelle = v)}
              >
                📍 {v}
              </button>
            {/each}
          </div>
        </div>

        <button type="button" class="haupt-knopf" onclick={sendeTicket}>
          Fahrt verbindlich buchen
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* 
   * Strict Two-Layer Liquid Glass Styling 
   * Content Layer: Dark Obsidian (#0a0a0c)
   * Functional Floating Layer: Liquid Glass (.glas-container)
   */
  .hud-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none; /* Karte bleibt interaktiv */
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 20px) 16px;
    z-index: 100;
  }

  .glas-container {
    pointer-events: auto;
    background: rgba(20, 20, 24, 0.72);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    border-radius: 24px;
    color: #f2f2ee;
  }

  /* 1. KOPF-KAPSEL */
  .kopf-leiste {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    margin-top: 8px;
  }

  .kapsel-segment {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .kapsel-segment.phase {
    flex-direction: row;
    gap: 8px;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .puls-punkt {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff5c00;
    animation: puls 1.5s infinite;
  }

  @keyframes puls {
    0% { transform: scale(0.95); opacity: 0.6; }
    50% { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.6; }
  }

  .kapsel-segment .label {
    font-size: 0.7rem;
    color: #a3a3ad;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .kapsel-segment .zeit {
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 1.15rem;
    color: #f2f2ee;
  }

  .icon-knopf {
    background: transparent;
    border: none;
    color: #a3a3ad;
    padding: 6px;
    cursor: pointer;
    border-radius: 8px;
  }
  .icon-knopf:active {
    transform: scale(0.95);
  }

  /* 2. WARNUNGEN */
  .warn-banner {
    pointer-events: auto;
    margin: 12px auto;
    padding: 12px 20px;
    border-radius: 16px;
    text-align: center;
    max-width: 90%;
    animation: warnErscheinen 0.3s ease-out;
  }

  .zone-warnung {
    background: rgba(255, 59, 92, 0.92);
    color: #fff;
    box-shadow: 0 0 24px rgba(255, 59, 92, 0.5);
  }

  .seeker-warnung {
    background: rgba(255, 92, 0, 0.92);
    color: #fff;
  }

  .warn-titel {
    font-weight: 800;
    font-size: 1.1rem;
    letter-spacing: 0.05em;
  }

  .warn-text {
    font-size: 0.85rem;
    margin-top: 2px;
  }

  .warn-kulanz {
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
  }

  /* 3. MR. X BOARD */
  .mrx-board {
    margin: 8px 0;
    padding: 10px 14px;
    max-width: 100%;
  }

  .board-titel {
    font-size: 0.75rem;
    color: #a3a3ad;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .ticket-leiste {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .ticket-badge {
    flex-shrink: 0;
    background: #1e1e24;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
  }

  .ticket-badge.black {
    background: #000;
    border-color: #ff5c00;
    color: #ff5c00;
  }

  .ticket-nr {
    color: #a3a3ad;
    font-size: 0.7rem;
  }

  .ticket-leer {
    font-size: 0.8rem;
    color: #71717a;
    font-style: italic;
  }

  /* 4. UNTERE AKTIONSKAPSEL */
  .aktions-kapsel {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 12px 16px;
    margin-bottom: 12px;
    gap: 10px;
  }

  .aktions-knopf {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #1e1e26;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    color: #f2f2ee;
    padding: 10px 8px;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: transform 0.1s ease-out;
  }

  .aktions-knopf:active {
    transform: scale(0.97);
  }

  .aktions-knopf.fangen {
    flex: 1.4;
    background: #2a2a34;
    color: #71717a;
  }

  .aktions-knopf.fangen.bereit {
    background: #ff5c00;
    color: #000;
    font-weight: 800;
    box-shadow: 0 4px 18px rgba(255, 92, 0, 0.45);
  }

  .fang-symbol {
    font-size: 1.4rem;
    line-height: 1;
  }

  .energie-badge {
    background: rgba(255, 92, 0, 0.2);
    color: #ff5c00;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
  }

  .chat-toggle {
    position: relative;
  }

  .chat-badge {
    position: absolute;
    top: 6px;
    right: 18px;
    background: #ff3b5c;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 1px 5px;
  }

  /* 5. MODAL SHEETS */
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: auto;
    z-index: 150;
  }

  .sheet-inhalt {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    padding: 16px 20px env(safe-area-inset-bottom, 24px) 20px;
    z-index: 160;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .sheet-griff {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.3);
    margin: 0 auto 12px auto;
  }

  .sheet-kopf {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .sheet-kopf h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  .faehigkeiten-liste {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .faehigkeit-karte {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #18181f;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .faehigkeit-info h4 {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
  }

  .faehigkeit-info p {
    margin: 0;
    font-size: 0.8rem;
    color: #a3a3ad;
  }

  .knopf-aktivieren {
    background: #ff5c00;
    color: #000;
    font-weight: 700;
    border: none;
    padding: 8px 14px;
    border-radius: 10px;
    cursor: pointer;
  }

  .chat-verlauf {
    min-height: 140px;
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .chat-zeile {
    font-size: 0.85rem;
    background: #191920;
    padding: 6px 10px;
    border-radius: 8px;
  }

  .chat-zeile.eigene {
    align-self: flex-end;
    background: rgba(255, 92, 0, 0.15);
  }

  .schnellfunk-chips {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }

  .chip {
    flex-shrink: 0;
    background: #24242e;
    color: #e4e4e7;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 6px 12px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .chat-form {
    display: flex;
    gap: 8px;
  }

  .chat-form input, .eingabe-feld {
    flex: 1;
    background: #101014;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    color: #f2f2ee;
    padding: 10px 14px;
  }

  .chat-form button, .haupt-knopf {
    background: #ff5c00;
    color: #000;
    font-weight: 700;
    border: none;
    border-radius: 12px;
    padding: 10px 18px;
    cursor: pointer;
  }

  .ticket-raster {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .ticket-option {
    background: #1a1a22;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f2f2ee;
    border-radius: 12px;
    padding: 12px;
    text-align: center;
    cursor: pointer;
  }

  .ticket-option.gewaehlt {
    border-color: #ff5c00;
    background: rgba(255, 92, 0, 0.15);
  }

  .ticket-eingaben {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .vorschlag-liste {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .vorschlag-item {
    background: #181820;
    color: #a3a3ad;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
  }
</script>
