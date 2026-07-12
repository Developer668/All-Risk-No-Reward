const VERSION = '__BUILD_VERSION__'
const STATIC_CACHE = `all-risk-static-${VERSION}`
const RUNTIME_CACHE = `all-risk-runtime-${VERSION}`
const CACHE_PREFIX = 'all-risk-'

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/maskable-512.svg',
  /*__BUILD_ASSETS__*/
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function networkFirstNavigation(request) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4_000)

  try {
    const response = await fetch(request, { signal: controller.signal })
    clearTimeout(timeout)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cache = await caches.open(RUNTIME_CACHE)
    return (await cache.match(request)) || (await caches.match('/index.html')) || (await caches.match('/offline.html')) || Response.error()
  } finally {
    clearTimeout(timeout)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE)
          await cache.put(request, response.clone())
        }
        return response
      }),
    )
  }
})

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data?.json() ?? {}
  } catch {
    message = { body: event.data?.text() }
  }

  const title = typeof message.title === 'string' ? message.title : 'Your challenge is ready'
  const options = {
    body: typeof message.body === 'string' ? message.body : 'Open All Risk to see what today has in store.',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: typeof message.tag === 'string' ? message.tag : 'daily-challenge',
    renotify: false,
    data: { url: typeof message.url === 'string' ? message.url : '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  let destination = new URL('/', self.location.origin)
  try {
    const requested = new URL(event.notification.data?.url ?? '/', self.location.origin)
    if (requested.origin === self.location.origin) destination = requested
  } catch {
    // Keep the safe, same-origin default destination.
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      const existing = clientList.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        if ('navigate' in existing) await existing.navigate(destination.href)
        existing.postMessage({ type: 'NOTIFICATION_OPENED', url: destination.pathname + destination.search })
        return existing.focus()
      }
      return self.clients.openWindow(destination.href)
    }),
  )
})
