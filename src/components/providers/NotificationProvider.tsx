'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  actions?: NotificationAction[]
}

export interface NotificationAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'destructive' | 'outline'
}

interface NotificationContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => string
  removeNotification: (id: string) => void
  clearAllNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? 5000 // Default 5 seconds
    }

    setNotifications(prev => [...prev, newNotification])

    // Auto-remove after duration
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, newNotification.duration)
    }

    return id
  }, [removeNotification])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const getIcon = (type: NotificationType) => {
    const iconProps = { className: 'h-5 w-5' }
    switch (type) {
      case 'success':
        return <CheckCircle {...iconProps} className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle {...iconProps} className="h-5 w-5 text-red-600" />
      case 'warning':
        return <AlertCircle {...iconProps} className="h-5 w-5 text-yellow-600" />
      case 'info':
        return <Info {...iconProps} className="h-5 w-5 text-blue-600" />
    }
  }

  const getNotificationClasses = (type: NotificationType) => {
    const baseClasses = 'rounded-lg border p-4 shadow-lg backdrop-blur-sm transition-all duration-300'
    switch (type) {
      case 'success':
        return `${baseClasses} bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800`
      case 'error':
        return `${baseClasses} bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800`
      case 'warning':
        return `${baseClasses} bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800`
      case 'info':
        return `${baseClasses} bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800`
    }
  }

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      removeNotification,
      clearAllNotifications
    }}>
      {children}

      {/* Notification Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={getNotificationClasses(notification.type)}
          >
            <div className="flex items-start gap-3">
              {getIcon(notification.type)}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm">{notification.title}</h4>
                {notification.message && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {notification.message}
                  </p>
                )}

                {/* Actions */}
                {notification.actions && notification.actions.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {notification.actions.map((action, index) => (
                      <Button
                        key={index}
                        size="sm"
                        variant={action.variant || 'outline'}
                        onClick={() => {
                          action.onClick()
                          removeNotification(notification.id)
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Close Button */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeNotification(notification.id)}
                className="h-8 w-8 p-0 hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

// Convenience hooks for different notification types
export function useNotify() {
  const { addNotification } = useNotifications()

  return {
    success: (title: string, message?: string, options?: Partial<Notification>) =>
      addNotification({ type: 'success', title, message, ...options }),

    error: (title: string, message?: string, options?: Partial<Notification>) =>
      addNotification({ type: 'error', title, message, ...options }),

    warning: (title: string, message?: string, options?: Partial<Notification>) =>
      addNotification({ type: 'warning', title, message, ...options }),

    info: (title: string, message?: string, options?: Partial<Notification>) =>
      addNotification({ type: 'info', title, message, ...options }),
  }
}