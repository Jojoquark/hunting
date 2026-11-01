/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// 1. Offline-Asset Precaching (Vite PWA Manifest Injection)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// 2. Push Notification Event (für T-60s Vorab-Pings bei ausgeschaltetem Bildschirm / iOS)
self.addEventListener('push', (event: PushEvent) => {
  let daten: any = {};
  if (event.data) {
    try {
      daten = event.data.json();
    } catch (e) {
      daten = { title: 'HUNTING', body: event.data.text() };
    }
  }

  const titel = daten.title || '⚠️ PING IN 60 SEKUNDEN!';
  const options: NotificationOptions = {
    body: daten.body || 'Öffne sofort die HUNTING-App, um deine Funkloch-Strafe zu vermeiden!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 400],
    data: {
      url: daten.url || '/',
      code: daten.code || '',
      typ: daten.typ || 'ping-warnung',
    },
    tag: 'hunting-vorab-ping',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(titel, options));
});

// 3. Notification Click: Öffnet oder fokussiert das Spiel
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const zielUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Wenn bereits ein Tab offen ist, diesen in den Vordergrund bringen
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Ansonsten neuen Tab öffnen
      if (self.clients.openWindow) {
        return self.clients.openWindow(zielUrl);
      }
    })
  );
});

// 4. Schnelle Aktivierung
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
