<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { spielNetz } from '../lib/netz/socket';
  import { geoTracker, type GeoPosition } from '../lib/ortung/geolocation';
  import { klang } from '../lib/klang/sound';
  import Icon from '../lib/ui/Icon.svelte';
  import Karte from '../lib/karte/Karte.svelte';
  import type { Auswertung } from './Ende.svelte';

  // Props über Svelte 5 $props()
  interface Props {
    spielerId?: string;
    token?: string;
    spielerName?: string;
    spielCode?: string;
    istHost?: boolean;
    rolle?: string;
    modus?: string;
    onGefangen?: () => void;
    onSpielEnde?: (sieger: string, auswertung: Auswertung[]) => void;
  }

  let {
    spielerId = '',
    token = '',
    spielerName = 'Spieler',
    spielCode = '',
    istHost = false,
    rolle = 'hider', // 'seeker' | 'hider' | 'zombie' | 'mrx' | 'detektiv' | 'zuschauer'
    modus = 'klassisch', // 'klassisch' | 'zombie' | 'mrx'
    onGefangen = () => {},
    onSpielEnde = (_sieger: string, _auswertung: Auswertung[]) => {},
  }: Props = $props();

  let spielRolle = $state(untrack(() => rolle));

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

  let offenesSheet = $state<'keins' | 'faehigkeiten' | 'chat' | 'ticket'>('keins');
  let verbindungsStatus = $state('verbinde');
  let chatKanal = $state<'alle' | 'team' | 'zuschauer'>('team');
  let chatEingabe = $state('');
  let chatNachrichten = $state<Array<{ von: string; text: string; kanal: string; zeit: number }>>([]);

  // Display Dauer-Aktiv & Video-Wachhalter Status
  let displayWachAktiv = $state(true);
  let toastMeldung = $state<string | null>(null);
  let toastTimer: number | null = null;
  let videoElement: HTMLVideoElement | null = null;

  // Ticket-Formular für Mr. X
  let gewaehltesTicket = $state<'bus' | 'tram' | 'ubahn' | 'sbahn' | 'zug' | 'faehre' | 'black' | 'doppel'>('bus');
  let ticketLinie = $state('');
  let ticketHaltestelle = $state('');
  let haltestellenVorschlaege = $state<string[]>([
    'Hauptbahnhof (Gleis 1-4)',
    'Zentrum / Rathaus',
    'Universitätsplatz',
    'Stadtpark Nord',
  ]);

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

  let istVersteckphase = $derived(spielZustand.phase === 'verstecken');
  let testModus = $derived(Boolean(spielZustand.einstellungen?.testModus));
  // Testmodus: nach dem ersten Tipp auf die Karte zählt nur noch die getippte Position.
  let manuellePosition = false;

  function setzeTestPosition([lng, lat]: [number, number]) {
    if (!testModus) return;
    manuellePosition = true;
    letzteGeoPosition = { lat, lng, genauigkeit: 5 };
    spielNetz.sendOrt({ lat, lng, genauigkeit: 5, zeit: Date.now() });
  }
  let faehigkeitenAktiv = $derived(Boolean(spielZustand.einstellungen?.faehigkeitenAktiv));
  // Fähigkeiten-Seite gemäß worker/src/faehigkeiten.ts
  const HIDER_FAEHIGKEITEN = ['tarnkappe', 'koeder', 'radar', 'stoersender', 'schild'];
  let sichtbareFaehigkeiten = $derived(
    Object.entries(de.faehigkeiten.katalog).filter(([id]) =>
      ['hider', 'mensch', 'mrx'].includes(spielRolle) ? HIDER_FAEHIGKEITEN.includes(id) : !HIDER_FAEHIGKEITEN.includes(id)
    )
  );
  let istMrXModus = $derived(modus === 'mrx');
  let istMrX = $derived(spielRolle === 'mrx');
  // Rollenkarte zum Rundenstart (und erneut, wenn die Rolle wechselt, z. B. zum Zombie)
  const ROLLEN = ['seeker', 'hider', 'zombie', 'mensch', 'mrx', 'detektiv'] as const;
  type RollenId = (typeof ROLLEN)[number];
  let hatServerZustand = $state(false);
  let gesehenRolle = $state(leseGeseheneRolle());
  let rollenInfo = $derived(
    (ROLLEN as readonly string[]).includes(spielRolle) ? de.rollen[spielRolle as RollenId] : null
  );
  let zeigeRollenKarte = $derived(
    hatServerZustand && rollenInfo !== null && gesehenRolle !== spielRolle && spielZustand.phase !== 'ende'
  );
  let istVerstecker = $derived(['hider', 'mensch', 'mrx'].includes(spielRolle));
  let ichVersteckt = $derived(Boolean(spielZustand.spieler?.[spielerId]?.versteckt));
  let abstimmung = $derived<{ fertig: number; gesamt: number }>(
    spielZustand.versteckAbstimmung ?? { fertig: 0, gesamt: 0 }
  );

  function rollenSchluessel() {
    return `hunting_rolle_${spielCode}_${spielerId}`;
  }

  function leseGeseheneRolle(): string | null {
    try {
      return localStorage.getItem(rollenSchluessel());
    } catch {
      return null;
    }
  }

  function bestaetigeRolle() {
    klang.klick();
    gesehenRolle = spielRolle;
    try {
      localStorage.setItem(rollenSchluessel(), spielRolle);
    } catch {
      // Ohne Speicher erscheint die Karte nach einem Reload erneut.
    }
  }

  function umschalteVersteckt() {
    klang.klick();
    spielNetz.sendVersteckt(!ichVersteckt);
  }

  let kannFangen = $derived(spielRolle === 'seeker' || spielRolle === 'zombie' || spielRolle === 'detektiv');

  let letzteGeoPosition = $state<{ lat: number; lng: number; genauigkeit: number } | null>(null);

  let zonenZentrum = $derived<[number, number]>(
    letzteGeoPosition ? [letzteGeoPosition.lng, letzteGeoPosition.lat] : [13.405, 52.52]
  );

  let kartenZone = $derived(
    spielZustand.zone || (spielZustand.aktuelleZone ? {
      mitte: [spielZustand.aktuelleZone.mittelpunkt.lng, spielZustand.aktuelleZone.mittelpunkt.lat],
      radius: spielZustand.aktuelleZone.radiusMeter,
    } : { mitte: zonenZentrum, radius: spielZustand.zonenRadius || 1000 })
  );

  let kartenSpieler = $derived.by(() => {
    if (!spielZustand.spieler) return [];
    return Object.entries(spielZustand.spieler)
      .filter(([id, sp]: [string, any]) => id !== spielerId && sp.sicht?.position && sp.sicht?.art !== 'unsichtbar')
      .map(([id, sp]: [string, any]) => ({
        id,
        name: sp.spitzname || sp.name || id,
        rolle: ((sp.rolle === 'seeker' || sp.rolle === 'jaeger') ? 'jaeger' : (sp.rolle === 'zombie' ? 'zombie' : 'gejagt')) as 'jaeger' | 'zombie' | 'gejagt',
        lat: sp.sicht.position.lat,
        lng: sp.sicht.position.lng,
        unscharf: sp.sicht?.art === 'unscharf',
      }));
  });

  /**
   * Video-Wachhalter Engine:
   * Hält iOS Safari und Android PWAs durch einen stummen 1-Frame Inline-Videoloop
   * unerbittlich wach, selbst wenn das Betriebssystem aggressiv in Standby schalten will.
   */
  function initialisiereVideoWachhalter() {
    if (typeof document === 'undefined') return;
    try {
      if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.setAttribute('muted', '');
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.setAttribute('loop', '');
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.style.position = 'fixed';
        videoElement.style.opacity = '0.0001';
        videoElement.style.pointerEvents = 'none';
        videoElement.style.width = '1px';
        videoElement.style.height = '1px';
        videoElement.style.top = '-100px';
        videoElement.style.left = '-100px';
        videoElement.style.zIndex = '-9999';
        // 1-Frame stummes MP4 Video
        videoElement.src =
          'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAABG1kYXQAAAAIZnJlZQAAAApmdHlwbXA0MgAAACBtZGF0';
        document.body.appendChild(videoElement);
      }
      videoElement.play().catch(() => {});
    } catch (e) {
      console.warn('[HUNTING] Video-Wachhalter Fallback:', e);
    }
  }

  function stoppeVideoWachhalter() {
    if (videoElement) {
      try {
        videoElement.pause();
      } catch (e) {}
    }
  }

  async function toggleDisplayWachhalter() {
    klang.klick();
    if (displayWachAktiv) {
      displayWachAktiv = false;
      await geoTracker.deaktiviereWakeLock();
      stoppeVideoWachhalter();
      zeigeToast('Display-Wachhalter pausiert – Display schaltet normal ab');
    } else {
      displayWachAktiv = true;
      await geoTracker.aktiviereWakeLock();
      initialisiereVideoWachhalter();
      zeigeToast('✓ Display: Dauer-Aktiv (Video-Wachhalter aktiv)');
    }
  }

  function zeigeToast(meldung: string) {
    toastMeldung = meldung;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMeldung = null;
    }, 2800);
  }

  onMount(() => {
    // 1. Geolocation & Video-Wachhalter starten
    geoTracker.starten();
    geoTracker.aktiviereWakeLock().catch(() => {});
    initialisiereVideoWachhalter();

    if (spielCode) {
      spielNetz.verbinden('', spielCode, spielerId, token);
      spielNetz.sendHallo(spielerName, spielRolle === 'seeker' ? 'crosshair' : 'circle', '#ff5c00', '', spielRolle);
      if (istHost) {
        spielNetz.sendHost('setup', { modus });
        spielNetz.sendHost('start');
      }
    }

    const unsubGeo = geoTracker.abonnieren((pos: GeoPosition) => {
      if (manuellePosition) return;
      letzteGeoPosition = { lat: pos.lat, lng: pos.lng, genauigkeit: pos.genauigkeit };
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
        const daten = msg.daten;
        if (daten.__status) {
          verbindungsStatus = daten.__status;
          return;
        }
        if (!daten.spieler) return;
        hatServerZustand = true;
        const ich = daten.spieler[spielerId];
        const vorherigeRolle = spielRolle;
        if (ich?.rolle) spielRolle = ich.rolle;
        const wurdeZombie = vorherigeRolle === 'mensch' && ich?.rolle === 'zombie';
        const loot = (daten.lootPunkte || []).map((punkt: any) => ({
          id: punkt.id,
          lat: punkt.koordinate.lat,
          lng: punkt.koordinate.lng,
          wert: punkt.energieWert,
        }));
        const warAusserhalb = spielZustand.ausserhalbZone;
        const istVersteckphase = daten.phase === 'verstecken';
        spielZustand = {
          ...spielZustand,
          ...daten,
          fangbar: Boolean(daten.fangZielId),
          // In der Versteckphase läuft der Vorsprung-Countdown, danach die Jagdzeit.
          spielEndeZeit: daten.phasenStartZeit && daten.einstellungen
            ? daten.phasenStartZeit + (istVersteckphase
              ? daten.einstellungen.versteckZeitMinuten
              : daten.einstellungen.dauerMinuten) * 60000
            : spielZustand.spielEndeZeit,
          energie: typeof daten.energie === 'number' ? daten.energie : spielZustand.energie,
          ausserhalbZone: Boolean(ich?.ausserhalbZone),
          seekerInDerNaehe: Boolean(daten.naheGegner),
          kulanzSekunden: daten.einstellungen?.kulanzZeitZoneSekunden ?? spielZustand.kulanzSekunden,
          loot,
        };
        geoTracker.setAusserhalbZone(spielZustand.ausserhalbZone);
        if (spielZustand.ausserhalbZone && !warAusserhalb) klang.zonenWarnung();
        if ((ich?.gefangen || wurdeZombie) && daten.phase !== 'ende') {
          onGefangen();
        }
        if (daten.phase === 'ende') {
          const siegerMap: Record<string, string> = {
            zombie: 'zombies',
            mensch: 'menschen',
            detektiv: 'detektive'
          };
          onSpielEnde(siegerMap[daten.sieger] || daten.sieger || 'Unbekannt', daten.auswertung ?? []);
        }
      } else if (msg.typ === 'ereignis') {
        if (msg.daten.typ === 'phase' && msg.daten.phase === 'jagd') {
          klang.zonenWarnung();
          zeigeToast('Die Jagd beginnt!');
        } else if (msg.daten.typ === 'ping') {
          klang.radarPing();
        } else if (msg.daten.typ === 'zone') {
          klang.zonenWarnung();
        } else if (msg.daten.typ === 'fangAlarm') {
          klang.fangAlarm();
        } else if (msg.daten.typ === 'chat') {
          const chat = msg.daten.daten || msg.daten;
          chatNachrichten.push({
            von: chat.senderName || chat.von || 'Spieler',
            text: String(chat.text || ''),
            kanal: String(chat.kanal || 'alle'),
            zeit: Number(chat.zeit || msg.daten.zeit || Date.now()),
          });
          if (offenesSheet !== 'chat') {
            spielZustand.ungeleseneNachrichten++;
          }
        }
      } else if ((msg as any).typ === 'faehigkeit_antwort') {
        const antwort = msg as any;
        zeigeToast(antwort.nachricht || (antwort.erfolg ? 'Fähigkeit aktiviert' : 'Fähigkeit nicht verfügbar'));
      } else if (msg.typ === 'fang_abgelehnt') {
        zeigeToast(msg.grund || String(msg.daten || 'Der Fang wurde abgelehnt.'));
      } else if (msg.typ === 'fehler') {
        zeigeToast(msg.daten?.nachricht || 'Die Aktion konnte nicht ausgeführt werden.');
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
      if (toastTimer) clearTimeout(toastTimer);
      stoppeVideoWachhalter();
      if (videoElement && videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement);
        videoElement = null;
      }
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
    chatEingabe = '';
  }

</script>

<div class="spiel-ansicht">
  <Karte
    zentrum={zonenZentrum}
    zone={kartenZone}
    spieler={kartenSpieler}
    eigenePosition={letzteGeoPosition}
    pings={spielZustand.pings || []}
    loot={spielZustand.loot || []}
    onklick={setzeTestPosition}
  />
  <div class="hud-overlay">
  <!-- 1. OBERER SCHWEBENDER HUD-BEREICH -->
  <div class="oberer-hud-block">
    <header class="glas-container kopf-leiste">
      <div class="kapsel-segment phase">
        <span class="puls-punkt" class:aktiv={spielZustand.phase === 'jagd'}></span>
        <span class="phase-text">{de.hud.phase[spielZustand.phase as keyof typeof de.hud.phase] || 'Jagd'}</span>
      </div>

      <div class="kapsel-segment timer-zentral">
        <span class="label">{istVersteckphase ? de.hud.timer.versteckzeit : de.hud.timer.restzeit}</span>
        <span class="zeit">{restzeitText}</span>
      </div>

      {#if !istVersteckphase}
        <div class="kapsel-segment ping-timer">
          <span class="label">{de.hud.timer.naechsterPing}</span>
          <span class="zeit">{naechsterPingText}</span>
        </div>
      {/if}

      <!-- Schnelltaste für Wake-Lock Toggle im Header -->
      <button
        type="button"
        class="icon-knopf"
        class:aktiv={displayWachAktiv}
        title={displayWachAktiv ? 'Display: Dauer-Aktiv (Video-Wachhalter)' : 'Display: Normal'}
        onclick={toggleDisplayWachhalter}
        aria-label="Display-Wachhalter umschalten"
      >
        <Icon name={displayWachAktiv ? 'awake' : 'eye-off'} size={18} color={displayWachAktiv ? '#00e599' : '#a3a3ad'} />
      </button>
    </header>

    <!-- SCHWEBENDER WACHHALTER-STATUS-INDICATOR (APPLE LIQUID GLASS) -->
    <div class="wachhalter-schwebe-leiste">
      <button
        type="button"
        class="wachhalter-pill"
        class:inaktiv={!displayWachAktiv}
        onclick={toggleDisplayWachhalter}
        title="Tippen zum Bestätigen oder Umschalten des Display-Dauerbetriebs"
      >
        <span class="wachhalter-punkt" class:aktiv={displayWachAktiv}></span>
        <Icon name={displayWachAktiv ? 'eye' : 'eye-off'} size={14} color={displayWachAktiv ? '#00e599' : 'var(--tinte-3)'} />
        <span class="wachhalter-text">
          Display: <strong class="wachhalter-status">{displayWachAktiv ? 'Dauer-Aktiv' : 'Normal'}</strong>
          <span class="wachhalter-sub">(Video-Wachhalter)</span>
        </span>
      </button>

      {#if toastMeldung}
        <div class="wachhalter-toast" role="status">
          <span>{toastMeldung}</span>
        </div>
      {/if}
    </div>
  </div>

  {#if testModus}
    <div class="test-hinweis" role="status">TESTMODUS · Tippe auf die Karte, um dich zu bewegen</div>
  {/if}

  <!-- 2. WARNUNGEN (VERBINDUNG / ZONENVERLASS / FUNKLOCH / GEGNER NÄHE) -->
  {#if verbindungsStatus === 'reconnect' || verbindungsStatus === 'nicht_erreichbar'}
    <div class="warn-banner funkloch-warnung" role="status">
      <div class="warn-titel">Verbindung unterbrochen</div>
      <div class="warn-text">Neuer Versuch läuft automatisch. Lass die App geöffnet.</div>
    </div>
  {:else if spielZustand.ausserhalbZone}
    <div class="warn-banner zone-warnung">
      <div class="warn-titel">{de.hud.warnungen.zoneVerlassenTitel}</div>
      <div class="warn-text">{de.hud.warnungen.zoneVerlassenText}</div>
      <div class="warn-kulanz">{de.hud.warnungen.zoneKulanz.replace('%s', spielZustand.kulanzSekunden.toString())}</div>
    </div>
  {:else if spielZustand.funklochStrafe || (spielZustand.funklochRestSekunden && spielZustand.funklochRestSekunden > 0)}
    <div class="warn-banner funkloch-warnung">
      <div class="warn-titel">Funkloch-Strafe aktiv</div>
      <div class="warn-text">Deine Position ist für alle sichtbar wegen Verbindungsunterbrechung!</div>
      {#if spielZustand.funklochRestSekunden}
        <div class="warn-kulanz">Restdauer: {spielZustand.funklochRestSekunden}s</div>
      {/if}
    </div>
  {:else if spielZustand.seekerInDerNaehe && (spielRolle === 'hider' || spielRolle === 'mrx' || spielRolle === 'mensch')}
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
  {#if istVersteckphase && abstimmung.gesamt > 0}
    <div class="versteck-status" role="status">
      {de.versteck.status.replace('%s', String(abstimmung.fertig)).replace('%s', String(abstimmung.gesamt))}
    </div>
  {/if}

  <footer class="glas-container aktions-kapsel">
    {#if istVersteckphase && istVerstecker}
      <button
        type="button"
        class="aktions-knopf versteckt-knopf"
        class:bereit={ichVersteckt}
        aria-pressed={ichVersteckt}
        onclick={umschalteVersteckt}
      >
        <span class="fang-symbol">{ichVersteckt ? '✓' : '◎'}</span>
        <span>{ichVersteckt ? de.versteck.zurueck : de.versteck.fertig}</span>
      </button>
    {/if}

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

    {#if faehigkeitenAktiv && spielRolle !== 'zuschauer'}
      <button
        type="button"
        class="aktions-knopf sekundar"
        onclick={() => (offenesSheet = 'faehigkeiten')}
      >
        <div class="energie-badge">{spielZustand.energie}⚡</div>
        <span>{de.hud.aktionen.faehigkeiten}</span>
      </button>
    {/if}

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

  <!-- 4b. ROLLENKARTE ZUM RUNDENSTART -->
  {#if zeigeRollenKarte && rollenInfo}
    <div class="rollen-overlay" role="dialog" aria-modal="true" aria-labelledby="rollen-titel">
      <div class="rollen-karte">
        <div class="rollen-label">{de.rollen.titel}</div>
        <h2 id="rollen-titel" class="rollen-name rolle-{spielRolle}">{rollenInfo.name}</h2>
        <p class="rollen-ziel">{rollenInfo.ziel}</p>
        <ul class="rollen-regeln">
          {#each rollenInfo.regeln as regel}
            <li>{regel}</li>
          {/each}
        </ul>
        <button type="button" class="rollen-knopf" onclick={bestaetigeRolle}>{de.rollen.verstanden}</button>
      </div>
    </div>
  {/if}

  <!-- 5. MODAL SHEETS -->
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
          {#each sichtbareFaehigkeiten as [id, f]}
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
</div>

<style>
  .spiel-ansicht {
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: var(--grund);
  }

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

  /* 1. OBERER HUD-BLOCK */
  .oberer-hud-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    width: 100%;
  }

  .kopf-leiste {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    width: 100%;
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
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--zeit-schnell) var(--feder-aus), color var(--zeit-schnell) ease-out;
  }
  .icon-knopf:active {
    transform: scale(0.92);
  }
  .icon-knopf.aktiv {
    color: #00e599;
  }

  /* SCHWEBENDE WACHHALTER-PILL (LIQUID GLASS) */
  .wachhalter-schwebe-leiste {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: auto;
  }

  .wachhalter-pill {
    background: rgba(20, 20, 24, 0.72);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.35);
    border-radius: var(--radius-kapsel);
    padding: 6px 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--tinte);
    font-size: 0.75rem;
    cursor: pointer;
    transition: transform var(--zeit-schnell) var(--feder-aus), background-color var(--zeit-schnell) ease-out, border-color var(--zeit-schnell) ease-out;
    user-select: none;
  }

  .wachhalter-pill:active {
    transform: scale(0.96);
  }

  .wachhalter-pill.inaktiv {
    opacity: 0.75;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .wachhalter-punkt {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6e6e78;
    transition: background-color var(--zeit-schnell) ease-out, box-shadow var(--zeit-schnell) ease-out;
  }

  .wachhalter-punkt.aktiv {
    background: #00e599;
    box-shadow: 0 0 8px rgba(0, 229, 153, 0.6);
  }

  .wachhalter-status {
    color: #f2f2ee;
    font-weight: 700;
  }

  .wachhalter-sub {
    color: #a3a3ad;
    font-size: 0.7rem;
    font-weight: 400;
    margin-left: 2px;
  }

  .wachhalter-toast {
    background: rgba(14, 14, 18, 0.88);
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
    border-radius: var(--radius-kapsel);
    padding: 5px 12px;
    color: #00e599;
    font-size: 0.72rem;
    font-weight: 600;
    animation: toastErscheinen 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes toastErscheinen {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
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

  .funkloch-warnung {
    background: rgba(220, 38, 38, 0.92);
    color: #fff;
    box-shadow: 0 0 24px rgba(220, 38, 38, 0.5);
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

  .aktions-knopf.versteckt-knopf {
    flex: 1.4;
    background: var(--akzent);
    color: #0a0a0c;
    font-weight: 800;
  }

  .aktions-knopf.versteckt-knopf.bereit {
    background: #1e1e26;
    color: var(--tinte-2);
    font-weight: 600;
  }

  .test-hinweis {
    align-self: center;
    margin-top: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(143, 227, 58, 0.15);
    border: 1px solid rgba(143, 227, 58, 0.5);
    color: #8fe33a;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    pointer-events: none;
  }

  .versteck-status {
    align-self: center;
    margin-top: auto;
    margin-bottom: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(10, 10, 12, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tinte);
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  /* 4b. ROLLENKARTE */
  .rollen-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(5, 5, 7, 0.82);
    pointer-events: auto;
  }

  .rollen-karte {
    width: 100%;
    max-width: 420px;
    background: var(--flaeche);
    border: 1px solid var(--flaeche-rand);
    border-radius: var(--radius-l);
    padding: 24px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: rollenEin 320ms var(--feder-aus) both;
  }

  @keyframes rollenEin {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .rollen-karte { animation: none; }
  }

  .rollen-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tinte-2);
  }

  .rollen-name {
    margin: 0;
    font-family: var(--font-headline);
    font-size: clamp(2rem, 9vw, 2.6rem);
    line-height: 1.05;
  }

  .rollen-name.rolle-seeker,
  .rollen-name.rolle-detektiv { color: var(--rolle-jaeger); }
  .rollen-name.rolle-hider,
  .rollen-name.rolle-mensch,
  .rollen-name.rolle-mrx { color: var(--rolle-gejagt); }
  .rollen-name.rolle-zombie { color: var(--rolle-zombie); }

  .rollen-ziel {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--tinte);
  }

  .rollen-regeln {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--tinte-2);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .rollen-knopf {
    margin-top: 8px;
    height: 52px;
    border: none;
    border-radius: 16px;
    background: var(--akzent);
    color: #0a0a0c;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
  }

  .rollen-knopf:active {
    transform: scale(0.97);
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
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .ticket-option {
    background: #191920;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px 4px;
    color: #f2f2ee;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .ticket-option.gewaehlt {
    background: #ff5c00;
    color: #000;
    font-weight: 700;
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
    background: #1a1a22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #a3a3ad;
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
  }

</style>
