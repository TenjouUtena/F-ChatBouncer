/**
 * Service Worker for F-Chat Bouncer
 * Handles push notifications and background sync
 */

const CACHE_NAME = 'fchat-bouncer-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/logo.ico',
  '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'F-Chat Bouncer', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'New message received',
    icon: data.icon || '/logo.ico',
    badge: data.badge || '/logo.ico',
    tag: data.tag || 'fchat-notification',
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    actions: data.actions || [
      {
        action: 'open',
        title: 'Open',
        icon: '/logo.ico'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'F-Chat Bouncer', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Send message to main thread
  self.clients.matchAll().then((clients) => {
    if (clients.length > 0) {
      // Focus existing window
      clients[0].focus();
      clients[0].postMessage({
        type: 'NOTIFICATION_CLICK',
        action: action || 'open',
        data: data
      });
    } else {
      // Open new window if no clients exist
      self.clients.openWindow('/').then((windowClient) => {
        if (windowClient) {
          windowClient.postMessage({
            type: 'NOTIFICATION_CLICK',
            action: action || 'open',
            data: data
          });
        }
      });
    }
  });
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Handle background sync tasks
      Promise.resolve()
    );
  }
});

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('Service worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
