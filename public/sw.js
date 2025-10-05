// Service Worker for Pokémon Draft App
// Provides offline support and caching for better performance

const CACHE_NAME = 'pokemon-draft-v1'
const RUNTIME_CACHE = 'pokemon-draft-runtime-v1'

// Assets to cache immediately
const PRECACHE_ASSETS = [
  '/',
  '/create-draft',
  '/join-draft',
  '/manifest.json',
]

// Install event - precache assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell')
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event')
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - network first for API, cache first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return
  }

  // Skip POST requests and Supabase realtime
  if (request.method !== 'GET' || url.pathname.includes('/_next/webpack-hmr')) {
    return
  }

  // Network first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Cache first for static assets
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/)
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Network first for everything else (pages, data)
  event.respondWith(networkFirst(request))
})

// Network first strategy
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)

  try {
    const response = await fetch(request)
    // Cache successful responses
    if (response.status === 200) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    // Fall back to cache if network fails
    const cached = await cache.match(request)
    if (cached) {
      console.log('[SW] Serving from cache (offline):', request.url)
      return cached
    }
    throw error
  }
}

// Cache first strategy
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  try {
    const response = await fetch(request)
    if (response.status === 200) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    console.error('[SW] Fetch failed for:', request.url, error)
    throw error
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE)
        .then((cache) => cache.addAll(event.data.payload))
    )
  }
})

// Background sync for offline actions (optional enhancement)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag)

  if (event.tag === 'sync-draft-picks') {
    event.waitUntil(syncDraftPicks())
  }
})

async function syncDraftPicks() {
  // Implementation for syncing offline picks when connection is restored
  console.log('[SW] Syncing draft picks...')
  // This would integrate with your draft service
}

console.log('[SW] Service Worker loaded')
