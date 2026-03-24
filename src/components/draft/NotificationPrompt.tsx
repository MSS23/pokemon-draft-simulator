'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, X } from 'lucide-react'
import { getNotificationPermission, requestNotificationPermission, type NotificationPermissionState } from '@/lib/push-notifications'

export function NotificationPrompt() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setPermission(getNotificationPermission())
    // Check if user previously dismissed
    const wasDismissed = sessionStorage.getItem('notification-prompt-dismissed')
    if (wasDismissed) setDismissed(true)
  }, [])

  if (dismissed || permission === 'granted' || permission === 'unsupported') {
    return null
  }

  if (permission === 'denied') {
    return null // Can't ask again
  }

  const handleEnable = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
  }

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('notification-prompt-dismissed', 'true')
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
      <Bell className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 text-muted-foreground">
        Enable notifications to know when it&apos;s your turn
      </span>
      <Button size="sm" variant="outline" onClick={handleEnable} className="h-7 text-xs">
        Enable
      </Button>
      <button
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss notification prompt"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
