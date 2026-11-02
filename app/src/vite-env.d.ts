/// <reference lib="webworker" />

declare module 'workbox-precaching' {
  export function cleanupOutdatedCaches(): void;
  export function precacheAndRoute(entries: Array<{ url: string; revision?: string | null }>): void;
}

interface ServiceWorkerGlobalScope {
  __WB_MANIFEST?: Array<{ url: string; revision?: string | null }>;
}
