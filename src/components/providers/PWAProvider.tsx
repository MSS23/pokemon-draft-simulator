'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Register service worker
    registerServiceWorker()

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully')
      setDeferredPrompt(null)
      setShowInstallPrompt(false)
      toast.success('App installed! You can now use it offline.')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        })

        console.log('[PWA] Service Worker registered:', registration.scope)

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New service worker available')
              setIsUpdateAvailable(true)
              setWaitingWorker(newWorker)
              showUpdateNotification()
            }
          })
        })

        // Check for waiting worker on load
        if (registration.waiting) {
          setIsUpdateAvailable(true)
          setWaitingWorker(registration.waiting)
          showUpdateNotification()
        }

      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error)
      }
    }
  }

  const showUpdateNotification = () => {
    toast('New version available!', {
      description: 'Click to update to the latest version',
      action: {
        label: 'Update',
        onClick: handleUpdate
      },
      duration: Infinity
    })
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    console.log('[PWA] Install prompt outcome:', outcome)

    setDeferredPrompt(null)
    setShowInstallPrompt(false)
  }

  const handleUpdate = () => {
    if (!waitingWorker) return

    // Tell the waiting service worker to activate
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })

    // Reload the page when the new service worker activates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }

  // Show install prompt after 30 seconds if not dismissed
  useEffect(() => {
    if (!showInstallPrompt) return

    const timer = setTimeout(() => {
      if (showInstallPrompt && deferredPrompt) {
        toast('Install Pokémon Draft', {
          description: 'Install the app for offline access and better performance',
          action: {
            label: 'Install',
            onClick: handleInstall
          },
          duration: 10000
        })
      }
    }, 30000)

    return () => clearTimeout(timer)
  }, [showInstallPrompt, deferredPrompt])

  return <>{children}</>
}

// Hook to detect if app is running as PWA
export function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false)

  useEffect(() => {
    const checkPWA = () => {
      // Check if running in standalone mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches

      // Check iOS standalone
      const isIOSStandalone = (window.navigator as any).standalone === true

      // Check if launched from home screen (Android)
      const isInStandaloneMode = isStandalone || isIOSStandalone

      setIsPWA(isInStandaloneMode)
    }

    checkPWA()
  }, [])

  return isPWA
}

// Hook to check online/offline status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online!')
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.error('You are offline. Some features may be unavailable.')
    }

    setIsOnline(navigator.onLine)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
