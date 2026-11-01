/**
 * HUNTING PWA Keep-Awake & Video Wake-Keeper Modul
 * 
 * Verhindert das automatische Abdunkeln/Sperren des Smartphone-Bildschirms
 * während der aktiven GPS-Jagd.
 * 
 * Strategien:
 * 1. Screen Wake Lock API (Standard für Android Chrome & modernes Safari >= 16.4)
 * 2. Video Wake-Keeper Fallback (Stummes, unsichtbares Looping-Video für iOS Safari)
 */

export type WakeLockStrategy = 'native' | 'video' | 'none';

export interface KeepAwakeState {
  active: boolean;
  strategy: WakeLockStrategy;
  error?: string;
}

export type StateListener = (state: KeepAwakeState) => void;

// 1x1 Pixel blank WebM/MP4 Base64 Video für iOS Fallback
const BLANK_VIDEO_DATA_URI =
  'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAADd2ZXJzAAAABGZpbG0AAABkbXRhAAAABWRhdGEAAAAQAAAAAgAAABxpc3BtAAAACHZlcnMAAAAB';

export class KeepAwakeManager {
  private active = false;
  private strategy: WakeLockStrategy = 'none';
  private nativeSentinel: any = null;
  private videoElement: HTMLVideoElement | null = null;
  private listeners: Set<StateListener> = new Set();
  private boundVisibilityHandler: (() => void) | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
      document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public getStrategy(): WakeLockStrategy {
    return this.strategy;
  }

  public getState(): KeepAwakeState {
    return {
      active: this.active,
      strategy: this.strategy
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(error?: string) {
    const state: KeepAwakeState = {
      active: this.active,
      strategy: this.strategy,
      ...(error ? { error } : {})
    };
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  /**
   * Aktiviert den Wachhalte-Modus.
   * Versucht zuerst die native Screen Wake Lock API.
   * Falls nicht verfügbar oder fehlerhaft, greift der Video-Wake-Keeper.
   */
  public async acquire(): Promise<boolean> {
    if (this.active) {
      return true;
    }

    // 1. Versuch: Native Screen Wake Lock API
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        this.nativeSentinel = sentinel;
        this.active = true;
        this.strategy = 'native';

        sentinel.addEventListener('release', () => {
          if (this.strategy === 'native' && this.active) {
            this.nativeSentinel = null;
          }
        });

        this.notify();
        return true;
      } catch {
        // Fallback zu Video-Wake-Keeper
      }
    }

    // 2. Versuch: Video Wake-Keeper (iOS Safari Fallback)
    try {
      const video = this.ensureVideoElement();
      await video.play();
      this.active = true;
      this.strategy = 'video';
      this.notify();
      return true;
    } catch (err: any) {
      this.active = false;
      this.strategy = 'none';
      this.notify(err?.message || 'Wachhalten fehlgeschlagen');
      return false;
    }
  }

  /**
   * Deaktiviert den Wachhalte-Modus und gibt alle Systemressourcen frei.
   */
  public async release(): Promise<void> {
    if (!this.active && this.strategy === 'none') {
      return;
    }

    if (this.nativeSentinel) {
      try {
        await this.nativeSentinel.release();
      } catch {
        // Ignorieren falls bereits freigegeben
      }
      this.nativeSentinel = null;
    }

    if (this.videoElement) {
      try {
        this.videoElement.pause();
        if (this.videoElement.parentNode) {
          this.videoElement.parentNode.removeChild(this.videoElement);
        }
      } catch {
        // Ignorieren
      }
      this.videoElement = null;
    }

    this.active = false;
    this.strategy = 'none';
    this.notify();
  }

  private ensureVideoElement(): HTMLVideoElement {
    if (this.videoElement) {
      return this.videoElement;
    }

    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.loop = true;
    video.src = BLANK_VIDEO_DATA_URI;

    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.001';
    video.style.pointerEvents = 'none';

    document.body.appendChild(video);
    this.videoElement = video;
    return video;
  }

  private async handleVisibilityChange() {
    if (typeof document === 'undefined') return;

    if (document.visibilityState === 'visible' && this.active) {
      if (this.strategy === 'native' && !this.nativeSentinel) {
        try {
          this.nativeSentinel = await (navigator as any).wakeLock.request('screen');
        } catch {
          await this.acquire();
        }
      } else if (this.strategy === 'video' && this.videoElement && this.videoElement.paused) {
        try {
          await this.videoElement.play();
        } catch {
          // Autoplay Policy
        }
      }
    }
  }

  public destroy() {
    this.release();
    if (this.boundVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
    this.listeners.clear();
  }
}

export const keepAwake = new KeepAwakeManager();
