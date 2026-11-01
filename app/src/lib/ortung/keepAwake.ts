/**
 * HUNTING Keep-Awake Engine
 * 
 * Verhindert das Einschlafen des Displays und die Drosselung der Geolocation-Updates.
 * 1. Primär: Screen Wake Lock API (W3C Standard)
 * 2. Sekundär / Fallback für iOS Safari: Unsichtbares, stummes Endlos-Video (H.264)
 *    mit strikter iOS-Autoplay-Compliance (muted, playsinline, loop, catch error handler).
 */

// Minimaler, valider 1-Frame H.264 / MP4 Video-Stream (Base64)
const STUMMES_VIDEO_BASE64 =
  'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tAAAAKm1vb3YAAABsbXZoAAAAAAAAAAAAAAAAAAACrwAAMgAAAAEAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAABidHJrAAAAXHRraGQAAAADAAAAAAAAAAAAAAAAAAACrwAAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAABoaW5mAAAAEGRpbmYAAAAKZHJlZgAAAAABAAAAHGRtZWQAAAAQZG1pZgAAAAAAAAAAAAAA';

let wakeLockSentinel: WakeLockSentinel | null = null;
let videoElement: HTMLVideoElement | null = null;
let istAktiv = false;
let userInteractionListenerAktiv = false;

/**
 * Erzeugt oder konfiguriert das unsichtbare Video-Element unter Einhaltung
 * aller WebKit- und Chromium-Autoplay-Richtlinien.
 */
function holeOderErzeugeVideoElement(): HTMLVideoElement {
  if (videoElement && document.body.contains(videoElement)) {
    return videoElement;
  }

  const altesElement = document.getElementById('hunting-keepawake-video');
  if (altesElement instanceof HTMLVideoElement) {
    videoElement = altesElement;
    return videoElement;
  }

  const video = document.createElement('video');
  video.id = 'hunting-keepawake-video';

  // 1. Zwingend für iOS Safari: HTML-Attribute UND DOM-Properties müssen synchron sein!
  video.setAttribute('muted', '');
  video.muted = true;

  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  video.setAttribute('autoplay', '');
  video.autoplay = true;

  video.setAttribute('loop', '');
  video.loop = true;

  video.setAttribute('aria-hidden', 'true');
  video.src = STUMMES_VIDEO_BASE64;

  // 2. Optische Unsichtbarkeit ohne display: none (display: none pausiert Dekodierung in WebKit!)
  video.style.position = 'absolute';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.top = '-1000px';
  video.style.left = '-1000px';
  video.style.opacity = '0.001';
  video.style.pointerEvents = 'none';

  document.body.appendChild(video);
  videoElement = video;
  return video;
}

/**
 * Startet die Videowiedergabe mit fehlerabfangendem Promise-Handling (.catch()).
 */
async function spieleVideoAb(): Promise<void> {
  const video = holeOderErzeugeVideoElement();

  try {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (err: any) {
    // Unhandled Promise Rejection sauber verhindern
    console.warn('[KeepAwake] Video-Autoplay vorerst blockiert (Warten auf Benutzerinteraktion):', err?.message || err);

    // Einmaliger Touch/Click-Listener zur Autoplay-Freischaltung nach Nutzerinteraktion
    if (!userInteractionListenerAktiv && typeof window !== 'undefined') {
      userInteractionListenerAktiv = true;
      const reaktiviereBeiGeste = () => {
        userInteractionListenerAktiv = false;
        video.play().catch(() => {});
      };
      window.addEventListener('touchstart', reaktiviereBeiGeste, { once: true, passive: true });
      window.addEventListener('click', reaktiviereBeiGeste, { once: true, passive: true });
    }
  }
}

/**
 * Fordert den W3C Screen Wake Lock an.
 */
async function fordereWakeLockAn(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        if (istAktiv && document.visibilityState === 'visible') {
          fordereWakeLockAn().catch(() => {});
        }
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Behandelt Tab-Wechsel und Wiederkehr (z.B. nach Push-Warnung).
 */
function handleSichtbarkeitWechsel() {
  if (!istAktiv) return;

  if (document.visibilityState === 'visible') {
    if (!wakeLockSentinel) {
      fordereWakeLockAn().catch(() => {});
    }
    if (videoElement && videoElement.paused) {
      spieleVideoAb();
    }
  }
}

/**
 * Aktiviert das Display- und CPU-Wachhalten.
 */
export async function aktiviereWachbleiben(): Promise<void> {
  if (istAktiv) return;
  istAktiv = true;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleSichtbarkeitWechsel);
  }

  // 1. Primär W3C Wake Lock versuchen
  const wakeLockErfolg = await fordereWakeLockAn();

  // 2. Video-Fallback starten (für iOS Safari und PWA-Hintergrundsicherung)
  await spieleVideoAb();
}

/**
 * Deaktiviert das Wachhalten und gibt Systemressourcen frei.
 */
export async function deaktiviereWachbleiben(): Promise<void> {
  istAktiv = false;

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleSichtbarkeitWechsel);
  }

  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }

  if (videoElement) {
    try {
      videoElement.pause();
      videoElement.remove();
    } catch {}
    videoElement = null;
  }
}
