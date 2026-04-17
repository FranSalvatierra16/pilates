/* eslint-disable no-restricted-globals */
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// Primero: navegación siempre a la red para que /admin y la app se actualicen tras cada deploy
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 5 })
);

precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('push', (event) => {
  let title = 'Savia';
  let body = '';
  let icon = '/savia.png';
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      icon = data.icon || icon;
    } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, data, tag: data.tag || 'savia-notif', renotify: true })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const destination = event.notification.data?.url || '/notificaciones';
      const url = destination.startsWith('http') ? destination : self.location.origin + destination;
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
