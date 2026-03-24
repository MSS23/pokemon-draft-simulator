/**
 * Web Push Notification Service
 *
 * Manages push subscription lifecycle: permission requests, subscribe/unsubscribe,
 * and syncing subscriptions to the server via /api/push/subscribe.
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('PushNotifications')

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

/**
 * Convert a base64 string to a Uint8Array for use with PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Check if the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Get the current Notification permission status.
 */
export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Request notification permission from the user.
 * Returns the resulting permission status.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    log.warn('Push notifications not supported in this browser')
    throw new Error('Push notifications are not supported in this browser')
  }

  const permission = await Notification.requestPermission()
  log.info('Notification permission result', { permission })
  return permission
}

/**
 * Subscribe the user to push notifications.
 *
 * 1. Ensures a service worker is registered
 * 2. Creates a PushSubscription via the PushManager
 * 3. Sends subscription keys to the server for storage
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser')
  }

  if (!VAPID_PUBLIC_KEY) {
    log.error('VAPID public key is not configured')
    throw new Error('Push notifications are not configured. VAPID key missing.')
  }

  // Ensure permission is granted
  const permission = Notification.permission
  if (permission === 'denied') {
    throw new Error('Notification permission has been denied. Please enable it in browser settings.')
  }
  if (permission === 'default') {
    const result = await requestPermission()
    if (result !== 'granted') {
      throw new Error('Notification permission was not granted')
    }
  }

  // Get existing service worker registration
  const registration = await navigator.serviceWorker.ready
  log.info('Service worker ready for push subscription')

  // Check for existing subscription
  const existingSubscription = await registration.pushManager.getSubscription()
  if (existingSubscription) {
    log.info('Reusing existing push subscription')
    // Re-sync to server in case user_id changed
    await syncSubscriptionToServer(existingSubscription, userId)
    return existingSubscription
  }

  // Create new subscription
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })

  log.info('Created new push subscription')

  // Store on server
  await syncSubscriptionToServer(subscription, userId)

  return subscription
}

/**
 * Unsubscribe from push notifications and remove from server.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    log.info('No active push subscription to remove')
    return
  }

  // Remove from server first
  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } catch (err) {
    log.error('Failed to remove subscription from server', err)
  }

  // Unsubscribe locally
  await subscription.unsubscribe()
  log.info('Unsubscribed from push notifications')
}

/**
 * Check if the user currently has an active push subscription.
 */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

/**
 * Send subscription data to the server for storage.
 */
async function syncSubscriptionToServer(
  subscription: PushSubscription,
  userId: string
): Promise<void> {
  const key = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')

  if (!key || !auth) {
    throw new Error('Push subscription is missing encryption keys')
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
      auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
      user_id: userId,
      platform: 'web',
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    log.error('Failed to sync push subscription to server', { status: response.status, error: data })
    throw new Error(data.error || 'Failed to store push subscription')
  }

  log.info('Push subscription synced to server')
}
