// Changez ce nom lors d’une mise en production importante pour renouveler le cache installé.
const CACHE_NAME = 'jcpmf-static-2026-09-02-21'
const APP_FILES = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/session.html',
  '/profile.html',
  '/routes.html',
  '/admin.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/api.js',
  '/js/avatar.js',
  '/js/appearance-init.js',
  '/js/appearance.js',
  '/js/common.js',
  '/js/pwa.js',
  '/js/gamification.js',
  '/js/data-export.js',
  '/js/engagement.js',
  '/js/reminders.js',
  '/js/reminder-ui.js',
  '/js/login.js',
  '/js/register.js',
  '/js/dashboard.js',
  '/js/weather.js',
  '/js/routes-core.js',
  '/js/route-planner.js',
  '/js/routes.js',
  '/js/session.js',
  '/js/profile.js',
  '/js/admin.js',
  '/manifest.webmanifest',
  '/parcours.json',
  '/assets/avatars/avatar-man-1.svg',
  '/assets/avatars/avatar-man-2.svg',
  '/assets/avatars/avatar-woman-1.svg',
  '/assets/avatars/avatar-woman-2.svg',
  '/assets/avatars/avatar-runner-neutral.svg',
  '/assets/avatars/avatar-runner-neutral-2.svg',
  '/images/image.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/sons/warmup.mp3',
  '/sons/run.mp3',
  '/sons/walk.mp3',
  '/sons/sprint.mp3',
  '/sons/stretching.mp3'
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('jcpmf-static-') && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' })
        return cached || (event.request.mode === 'navigate' ? caches.match('/login.html') : Response.error())
      }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SHOW_INACTIVITY_REMINDER') return
  event.waitUntil(self.registration.showNotification(event.data.title || 'JCPMF', {
    body: event.data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'jcpmf-inactivity-reminder',
    renotify: true,
    data: { url: '/index.html' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/index.html', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const currentWindow = windows.find((client) => client.url.startsWith(self.location.origin))
    if (currentWindow) {
      return currentWindow.navigate(targetUrl).then((client) => client?.focus())
    }
    return self.clients.openWindow(targetUrl)
  }))
})
