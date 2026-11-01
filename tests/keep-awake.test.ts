import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeepAwakeManager } from '../app/src/lib/keep-awake.js';

describe('KeepAwakeManager & Video Wake-Keeper Unit Tests', () => {
  let manager: KeepAwakeManager;
  let mockWakeLockRequest: any;
  let mockSentinel: any;
  let mockVideoElement: any;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    mockVideoElement = {
      setAttribute: vi.fn(),
      muted: false,
      loop: false,
      src: '',
      style: {},
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      parentNode: {
        removeChild: vi.fn()
      }
    };

    (globalThis as any).document = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      createElement: vi.fn().mockImplementation((tag: string) => {
        if (tag === 'video') return mockVideoElement;
        return {};
      }),
      body: {
        appendChild: vi.fn()
      }
    };

    mockSentinel = {
      released: false,
      release: vi.fn().mockImplementation(async () => {
        mockSentinel.released = true;
      }),
      addEventListener: vi.fn()
    };

    mockWakeLockRequest = vi.fn().mockResolvedValue(mockSentinel);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: mockWakeLockRequest
        }
      },
      configurable: true,
      writable: true
    });

    manager = new KeepAwakeManager();
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
    vi.restoreAllMocks();
    delete (globalThis as any).document;
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true
    });
  });

  it('initialisiert im inaktiven Zustand mit Strategie "none"', () => {
    expect(manager.isActive()).toBe(false);
    expect(manager.getStrategy()).toBe('none');
  });

  it('nutzt primär die native Screen Wake Lock API wenn verfügbar', async () => {
    const success = await manager.acquire();

    expect(success).toBe(true);
    expect(manager.isActive()).toBe(true);
    expect(manager.getStrategy()).toBe('native');
    expect(mockWakeLockRequest).toHaveBeenCalledWith('screen');
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('gibt den nativen Wake Lock sauber frei', async () => {
    await manager.acquire();
    expect(manager.isActive()).toBe(true);

    await manager.release();
    expect(manager.isActive()).toBe(false);
    expect(manager.getStrategy()).toBe('none');
    expect(mockSentinel.release).toHaveBeenCalled();
  });

  it('fällt transparent auf den Video Wake-Keeper zurück wenn Native nicht unterstützt wird', async () => {
    delete (globalThis as any).navigator.wakeLock;

    const success = await manager.acquire();

    expect(success).toBe(true);
    expect(manager.isActive()).toBe(true);
    expect(manager.getStrategy()).toBe('video');

    expect(document.createElement).toHaveBeenCalledWith('video');
    expect(mockVideoElement.setAttribute).toHaveBeenCalledWith('playsinline', 'true');
    expect(mockVideoElement.setAttribute).toHaveBeenCalledWith('webkit-playsinline', 'true');
    expect(mockVideoElement.muted).toBe(true);
    expect(mockVideoElement.loop).toBe(true);
    expect(mockVideoElement.play).toHaveBeenCalled();
  });

  it('fällt auf Video Wake-Keeper zurück wenn Native Request rejected wird', async () => {
    mockWakeLockRequest.mockRejectedValueOnce(new Error('NotAllowedError: screen lock denied'));

    const success = await manager.acquire();

    expect(success).toBe(true);
    expect(manager.isActive()).toBe(true);
    expect(manager.getStrategy()).toBe('video');
    expect(mockVideoElement.play).toHaveBeenCalled();
  });

  it('gibt den Video Wake-Keeper sauber frei (pausiert und entfernt Element)', async () => {
    delete (globalThis as any).navigator.wakeLock;

    await manager.acquire();
    expect(manager.isActive()).toBe(true);

    await manager.release();
    expect(manager.isActive()).toBe(false);
    expect(manager.getStrategy()).toBe('none');
    expect(mockVideoElement.pause).toHaveBeenCalled();
    expect(mockVideoElement.parentNode.removeChild).toHaveBeenCalledWith(mockVideoElement);
  });

  it('ist idempotent: mehrfacher Aufruf von acquire() erzeugt keine doppelten Sperren', async () => {
    await manager.acquire();
    await manager.acquire();

    expect(mockWakeLockRequest).toHaveBeenCalledTimes(1);
    expect(manager.isActive()).toBe(true);
  });

  it('reagiert auf Tab-Wechsel und reaktiviert Lock bei Sichtbarkeit', async () => {
    expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    await manager.acquire();
    expect(manager.isActive()).toBe(true);

    mockSentinel.released = true;
    (manager as any).nativeSentinel = null;

    (document as any).visibilityState = 'visible';
    await (manager as any).handleVisibilityChange();

    expect(mockWakeLockRequest).toHaveBeenCalledTimes(2);
  });

  it('benachrichtigt Observer über Zustandsänderungen', async () => {
    const states: any[] = [];
    const unsubscribe = manager.subscribe(state => states.push({ ...state }));

    expect(states.length).toBe(1);
    expect(states[0].active).toBe(false);

    await manager.acquire();
    expect(states.length).toBe(2);
    expect(states[1].active).toBe(true);
    expect(states[1].strategy).toBe('native');

    await manager.release();
    expect(states.length).toBe(3);
    expect(states[2].active).toBe(false);

    unsubscribe();
    await manager.acquire();
    expect(states.length).toBe(3);
  });

  it('behandelt vollständigen Fehlschlag beider Strategien ohne Unhandled Exception', async () => {
    delete (globalThis as any).navigator.wakeLock;
    mockVideoElement.play.mockRejectedValueOnce(new Error('Autoplay prevented by policy'));

    const success = await manager.acquire();

    expect(success).toBe(false);
    expect(manager.isActive()).toBe(false);
    expect(manager.getStrategy()).toBe('none');
  });
});
