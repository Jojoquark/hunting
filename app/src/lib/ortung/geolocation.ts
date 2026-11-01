/**
 * HUNTING - Geolocation & Screen Wake Lock Controller
 * - watchPosition mit enableHighAccuracy
 * - Intelligenter Sendetakt:
 *     - Sofort bei Bewegung > 10 m
 *     - Sonst alle 15 s Lebenszeichen
 *     - Außerhalb der Zone sofort und alle 5 s
 * - Screen Wake Lock & iOS Silent Video Loop via Wachhalter
 */

import { wachhalter } from './wachhalter';

export interface GeoPosition {
  lat: number;
  lng: number;
  genauigkeit: number;
  zeit: number;
  tempo?: number;
  peilung?: number;
}

export type GeoPositionsCallback = (pos: GeoPosition, trigger: 'bewegung' | 'lebenszeichen' | 'zone') => void;

export class GeoTracker {
  private watchId: number | null = null;
  private letztePosition: GeoPosition | null = null;
  private letzteGesendetePosition: GeoPosition | null = null;
  private letzterSendeZeitpunkt: number = 0;
  private timerIntervall: number | null = null;

  public istAktiv = false;
  public fehler: string | null = null;
  public ausserhalbZone = false;
  public kompassRichtung: number | null = null;

  private callbacks: Set<GeoPositionsCallback> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('deviceorientation', (ev: DeviceOrientationEvent) => {
        let heading: number | null = null;
        if ('webkitCompassHeading' in ev && typeof (ev as any).webkitCompassHeading === 'number') {
          heading = (ev as any).webkitCompassHeading;
        } else if (ev.alpha !== null && !isNaN(ev.alpha)) {
          heading = (360 - ev.alpha) % 360;
        }
        if (heading !== null) {
          this.kompassRichtung = heading;
        }
      }, true);
    }
  }

  /**
   * Startet die kontinuierliche GPS-Ortung und aktiviert den Wachhalter
   */
  public starten(): void {
    if (this.istAktiv || typeof window === 'undefined') return;

    if (!('geolocation' in navigator)) {
      this.fehler = 'Geolocation wird von diesem Gerät / Browser nicht unterstützt.';
      return;
    }

    this.istAktiv = true;
    this.fehler = null;

    // Wachhalter (Screen Wake Lock & iOS Silent Video Loop) sofort aktivieren
    wachhalter.aktivieren().catch(() => {});

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.verarbeitePosition(pos),
      (err) => this.verarbeiteFehler(err),
      options
    );

    // Regelmäßiger Heartbeat-Loop (Prüfung alle 1000ms)
    this.timerIntervall = window.setInterval(() => {
      this.pruefeSendetakt();
    }, 1000);
  }

  /**
   * Stoppt die Ortung und gibt Ressourcen frei (inkl. Wachhalter)
   */
  public stoppen(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.timerIntervall !== null) {
      clearInterval(this.timerIntervall);
      this.timerIntervall = null;
    }
    this.istAktiv = false;
    wachhalter.deaktivieren().catch(() => {});
  }

  private verarbeitePosition(raw: GeolocationPosition): void {
    const coords = raw.coords;
    const pos: GeoPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      genauigkeit: coords.accuracy,
      zeit: raw.timestamp || Date.now(),
      tempo: coords.speed !== null && !isNaN(coords.speed) ? coords.speed : undefined,
      peilung: coords.heading !== null && !isNaN(coords.heading) ? coords.heading : undefined,
    };

    this.letztePosition = pos;

    // Erste Position überhaupt sofort senden
    if (!this.letzteGesendetePosition) {
      this.sendePosition(pos, 'lebenszeichen');
      return;
    }

    // Bewegung berechnen
    const distanz = this.haversineDistanz(
      this.letzteGesendetePosition.lat,
      this.letzteGesendetePosition.lng,
      pos.lat,
      pos.lng
    );

    // Kriterium 1: Bewegung > 10m -> Sofort senden!
    if (distanz >= 10) {
      this.sendePosition(pos, 'bewegung');
    }
  }

  private pruefeSendetakt(): void {
    if (!this.letztePosition) return;

    const now = Date.now();
    const vergangenSeitSendung = now - this.letzterSendeZeitpunkt;

    // Kriterium 2: Außerhalb der Zone -> Alle 5 Sekunden senden
    if (this.ausserhalbZone) {
      if (vergangenSeitSendung >= 5000) {
        this.sendePosition(this.letztePosition, 'zone');
      }
      return;
    }

    // Kriterium 3: Lebenszeichen alle 15 Sekunden
    if (vergangenSeitSendung >= 15000) {
      this.sendePosition(this.letztePosition, 'lebenszeichen');
    }
  }

  private sendePosition(pos: GeoPosition, trigger: 'bewegung' | 'lebenszeichen' | 'zone'): void {
    this.letzteGesendetePosition = pos;
    this.letzterSendeZeitpunkt = Date.now();

    for (const cb of this.callbacks) {
      try {
        cb(pos, trigger);
      } catch (e) {
        console.error('[HUNTING Geo] Fehler in Positions-Callback:', e);
      }
    }
  }

  private verarbeiteFehler(err: GeolocationPositionError): void {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        this.fehler = 'Standortzugriff wurde verweigert. Bitte Berechtigung erteilen!';
        break;
      case err.POSITION_UNAVAILABLE:
        this.fehler = 'Kein GPS-Signal verfügbar. Bitte freien Himmel aufsuchen.';
        break;
      case err.TIMEOUT:
        // Timeout wird ignoriert, solange wir auf das nächste Signal warten
        break;
      default:
        this.fehler = `Standortfehler: ${err.message}`;
    }
  }

  /**
   * Haversine Formel zur exakten Distanzberechnung in Metern
   */
  public haversineDistanz(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Erdradius in Metern
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const aSafe = Math.min(1, Math.max(0, a));
    const c = 2 * Math.atan2(Math.sqrt(aSafe), Math.sqrt(Math.max(0, 1 - aSafe)));
    return R * c;
  }

  public abonnieren(cb: GeoPositionsCallback): () => void {
    this.callbacks.add(cb);
    if (this.letztePosition) {
      cb(this.letztePosition, 'lebenszeichen');
    }
    return () => this.callbacks.delete(cb);
  }

  public setAusserhalbZone(status: boolean): void {
    this.ausserhalbZone = status;
    if (status && this.letztePosition) {
      // Bei Zonenverlass sofort melden
      this.sendePosition(this.letztePosition, 'zone');
    }
  }

  public getLetztePosition(): GeoPosition | null {
    return this.letztePosition;
  }

  // --- Screen Wake Lock & Wachhalter Delegation (100% abwärtskompatibel) ---

  public get wakeLockAktiv(): boolean {
    return wachhalter.istAktiv;
  }

  public get wakeLockUnterstuetzt(): boolean {
    return wachhalter.wakeLockUnterstuetzt;
  }

  public get wakeLockErwuenscht(): boolean {
    return wachhalter.istAktiv;
  }

  public async aktiviereWakeLock(): Promise<boolean> {
    return await wachhalter.aktivieren();
  }

  public async deaktiviereWakeLock(): Promise<void> {
    await wachhalter.deaktivieren();
  }

  public async toggleWakeLock(): Promise<boolean> {
    return await wachhalter.toggle();
  }
}

export const geoTracker = new GeoTracker();
