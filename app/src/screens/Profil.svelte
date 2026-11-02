<script lang="ts">
  import { untrack } from 'svelte';
  import { de } from '../lib/i18n/de';
  import { klang } from '../lib/klang/sound';
  import { geoTracker } from '../lib/ortung/geolocation';
  import { kontoAbmelden, kontoZugang, ladeStatistik, type KontoSitzung, type KontoStatistik } from '../lib/netz/konto';

  interface Props {
    spitzname?: string;
    konto?: KontoSitzung | null;
    onZurueck?: () => void;
    onSpitznameChange?: (name: string) => void;
    onKontoAenderung?: (konto: KontoSitzung | null) => void;
  }

  let {
    spitzname = 'Geist-07',
    konto = null,
    onZurueck = () => {},
    onSpitznameChange = () => {},
    onKontoAenderung = () => {},
  }: Props = $props();

  let kontoArt = $state<'anmelden' | 'registrieren'>('anmelden');
  let kontoName = $state('');
  let kontoPasswort = $state('');
  let kontoFehler = $state('');
  let kontoLaedt = $state(false);
  let statistik = $state<KontoStatistik | null>(null);

  // Statistik neu laden, sobald ein Konto angemeldet ist
  $effect(() => {
    if (!konto) {
      statistik = null;
      return;
    }
    void ladeStatistik().then((s) => (statistik = s));
  });

  const MODUS_NAMEN: Record<string, string> = { klassisch: 'Klassisch', zombie: 'Zombie', mrx: 'Mr. X' };

  function km(meter: number) {
    return (meter / 1000).toFixed(1).replace('.', ',');
  }

  async function sendeKonto(event: SubmitEvent) {
    event.preventDefault();
    if (kontoLaedt) return;
    kontoFehler = '';
    kontoLaedt = true;
    try {
      const sitzung = await kontoZugang(kontoArt, kontoName.trim(), kontoPasswort);
      kontoPasswort = '';
      lokalerName = sitzung.name;
      onKontoAenderung(sitzung);
    } catch (fehler) {
      kontoFehler = fehler instanceof Error ? fehler.message : 'Anmeldung fehlgeschlagen.';
    } finally {
      kontoLaedt = false;
    }
  }

  async function abmelden() {
    await kontoAbmelden();
    onKontoAenderung(null);
  }

  let lokalerName = $state(untrack(() => spitzname));
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

    <!-- KONTO -->
    <div class="sektion">
      <div class="sektion-label">Konto</div>
      {#if konto}
        <div class="konto-zeile">
          <span>Angemeldet als <strong>{konto.name}</strong></span>
          <button type="button" class="konto-link" onclick={abmelden}>Abmelden</button>
        </div>
        <p class="profil-hinweis">Dein Name ist reserviert und auf jedem Gerät gleich.</p>
      {:else}
        <div class="konto-reiter" role="tablist">
          <button type="button" role="tab" aria-selected={kontoArt === 'anmelden'} class:aktiv={kontoArt === 'anmelden'} onclick={() => { kontoArt = 'anmelden'; kontoFehler = ''; }}>Anmelden</button>
          <button type="button" role="tab" aria-selected={kontoArt === 'registrieren'} class:aktiv={kontoArt === 'registrieren'} onclick={() => { kontoArt = 'registrieren'; kontoFehler = ''; }}>Registrieren</button>
        </div>
        <form class="konto-formular" onsubmit={sendeKonto}>
          <input
            type="text"
            class="name-eingabe"
            placeholder="Benutzername"
            aria-label="Benutzername"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            maxlength="20"
            bind:value={kontoName}
          />
          <input
            type="password"
            class="name-eingabe"
            placeholder={kontoArt === 'registrieren' ? 'Passwort (mind. 8 Zeichen)' : 'Passwort'}
            aria-label="Passwort"
            autocomplete={kontoArt === 'registrieren' ? 'new-password' : 'current-password'}
            maxlength="128"
            bind:value={kontoPasswort}
          />
          {#if kontoFehler}<p class="konto-fehler" role="alert">{kontoFehler}</p>{/if}
          <button type="submit" class="konto-knopf" disabled={kontoLaedt}>
            {kontoLaedt ? 'Bitte warten …' : kontoArt === 'registrieren' ? 'Konto erstellen' : 'Anmelden'}
          </button>
        </form>
        <p class="profil-hinweis">Optional. Ohne E-Mail: Ein vergessenes Passwort lässt sich nicht zurücksetzen.</p>
      {/if}
    </div>

    {#if konto}
      <div class="sektion">
        <div class="sektion-label">{de.profil.statistikenTitel}</div>
        {#if !statistik}
          <p class="profil-hinweis">Statistik wird geladen …</p>
        {:else if statistik.spiele === 0}
          <p class="profil-hinweis">Noch keine Runde gespielt. Runden zählen, wenn du beim Beitreten angemeldet bist.</p>
        {:else}
          <div class="statistik-gitter">
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{statistik.spiele}</span><span>{de.profil.spieleGesamt}</span></div>
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{statistik.siege}</span><span>Siege</span></div>
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{statistik.siegeFaenger}</span><span>{de.profil.siegeSeeker}</span></div>
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{statistik.siegeGejagt}</span><span>{de.profil.siegeHider}</span></div>
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{km(statistik.distanzMeter)}</span><span>{de.profil.gesamtKm}</span></div>
            <div class="statistik-kachel"><span class="statistik-wert tabular-nums">{statistik.faenge}</span><span>{de.profil.gesamtFaenge}</span></div>
          </div>
          <ul class="letzte-runden">
            {#each statistik.letzte as runde (runde.spielCode)}
              <li>
                <span class="runden-ergebnis" class:sieg={runde.gewonnen}>{runde.gewonnen ? 'Sieg' : 'Niederlage'}</span>
                <span>{MODUS_NAMEN[runde.modus] ?? runde.modus} · {runde.team === 'faenger' ? 'Fänger' : 'Gejagt'}</span>
                <span class="tabular-nums">{km(runde.distanzMeter)} km · {runde.faenge} Fänge</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- SPITZNAME -->
    <div class="sektion">
      <label for="spitzname-input" class="sektion-label">{de.profil.spitzname}</label>
      <input
        id="spitzname-input"
        type="text"
        bind:value={lokalerName}
        onchange={() => onSpitznameChange(lokalerName)}
        class="name-eingabe"
        maxlength="20"
        disabled={Boolean(konto)}
      />
      <p class="profil-hinweis">{konto ? 'Mit Konto spielst du unter deinem Benutzernamen.' : 'Der Name wird nur in diesem Browser gespeichert.'}</p>
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

  .profil-hinweis {
    margin: 0;
    color: #a3a3ad;
    font-size: 0.75rem;
  }

  .name-eingabe:disabled {
    opacity: 0.6;
  }

  .konto-zeile {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: #131318;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px 16px;
    font-size: 0.9rem;
  }

  .konto-link {
    background: transparent;
    border: none;
    color: #ff5c00;
    font-weight: 700;
    cursor: pointer;
  }

  .konto-reiter {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .konto-reiter button {
    background: #131318;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 8px;
    color: #a3a3ad;
    font-weight: 600;
    cursor: pointer;
  }

  .konto-reiter button.aktiv {
    border-color: #ff5c00;
    color: #f2f2ee;
  }

  .konto-formular {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .konto-fehler {
    margin: 0;
    color: #ff3b5c;
    font-size: 0.8rem;
  }

  .konto-knopf {
    height: 48px;
    border: none;
    border-radius: 14px;
    background: #ff5c00;
    color: #0a0a0c;
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
  }

  .konto-knopf:disabled {
    opacity: 0.6;
  }

  .statistik-gitter {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .statistik-kachel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: #131318;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 10px 12px;
    font-size: 0.72rem;
    color: #a3a3ad;
  }

  .statistik-wert {
    font-size: 1.3rem;
    font-weight: 800;
    color: #f2f2ee;
  }

  .letzte-runden {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.78rem;
    color: #a3a3ad;
  }

  .letzte-runden li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .runden-ergebnis {
    font-weight: 700;
    color: #ff3b5c;
  }

  .runden-ergebnis.sieg {
    color: #ff5c00;
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
