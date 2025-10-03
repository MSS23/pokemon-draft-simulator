'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, X, Clock, DollarSign, Gavel, Trophy, AlertTriangle, Users, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { notificationService, DraftNotification } from '@/lib/notification-service'

interface AuctionNotificationsProps {
  draftId: string
  userTeamId: string | null
  isVisible?: boolean
  onToggle?: () => void
  className?: string
}

export default function AuctionNotifications({
  draftId,
  userTeamId,
  isVisible = true,
  onToggle,
  className
}: AuctionNotificationsProps) {
  const [notifications, setNotifications] = useState<DraftNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<'all' | 'auction' | 'urgent'>('all')

  // Load notifications from service
  useEffect(() => {
    const updateNotifications = () => {
      const allNotifications = notificationService.getNotificationHistory()
      
      // Filter to auction-related notifications
      const auctionNotifications = allNotifications.filter(notification => 
        ['auction_started', 'auction_ending', 'bid_placed', 'auction_won', 'auction_lost', 'turn_reminder']
          .includes(notification.type)
      )
      
      setNotifications(auctionNotifications)
      
      // Count unread (notifications from last 30 seconds)
      const thirtySecondsAgo = Date.now() - 30000
      const unread = auctionNotifications.filter(notification => 
        new Date(notification.timestamp).getTime() > thirtySecondsAgo
      ).length
      
      setUnreadCount(unread)
    }

    // Initial load
    updateNotifications()

    // Update every few seconds to catch new notifications
    const interval = setInterval(updateNotifications, 2000)
    
    return () => clearInterval(interval)
  }, [])

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'auction':
        return ['auction_started', 'bid_placed', 'auction_won', 'auction_lost'].includes(notification.type)
      case 'urgent':
        return notification.urgent
      default:
        return true
    }
  })

  const getNotificationIcon = (type: string, urgent: boolean) => {
    switch (type) {
      case 'auction_started':
        return <Gavel className="h-4 w-4 text-orange-600" />
      case 'auction_ending':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      case 'bid_placed':
        return <DollarSign className="h-4 w-4 text-green-600" />
      case 'auction_won':
        return <Trophy className="h-4 w-4 text-yellow-600" />
      case 'auction_lost':
        return <Trophy className="h-4 w-4 text-gray-600" />
      case 'turn_reminder':
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <Bell className={cn('h-4 w-4', urgent ? 'text-red-600' : 'text-gray-600')} />
    }
  }

  const getNotificationColor = (type: string, urgent: boolean) => {
    if (urgent) return 'border-red-200 bg-red-50 dark:bg-red-900/20'
    
    switch (type) {
      case 'auction_started':
        return 'border-orange-200 bg-orange-50 dark:bg-orange-900/20'
      case 'bid_placed':
        return 'border-green-200 bg-green-50 dark:bg-green-900/20'
      case 'auction_won':
        return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'
      case 'auction_lost':
        return 'border-gray-200 bg-gray-50 dark:bg-gray-800'
      default:
        return 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`
    } else if (diffInSeconds < 3600) {
      return `${Math.floor(diffInSeconds / 60)}m ago`
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const clearAllNotifications = () => {
    notificationService.clearHistory()
    setNotifications([])
    setUnreadCount(0)
  }

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 text-xs p-0 flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>
    )
  }

  return (
    <Card className={cn('w-full max-w-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-blue-600" />
            Auction Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {onToggle && (
              <Button variant="ghost" size="sm" onClick={onToggle}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1">
          <Button
            variant={filter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
            className="text-xs h-7"
          >
            All ({notifications.length})
          </Button>
          <Button
            variant={filter === 'auction' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('auction')}
            className="text-xs h-7"
          >
            <Gavel className="h-3 w-3 mr-1" />
            Auctions
          </Button>
          <Button
            variant={filter === 'urgent' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('urgent')}
            className="text-xs h-7"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Urgent
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notifications</p>
            <p className="text-xs mt-1">
              {filter === 'all' 
                ? 'Auction notifications will appear here' 
                : 'No notifications match the selected filter'
              }
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredNotifications.map((notification) => {
                  const isRecent = Date.now() - new Date(notification.timestamp).getTime() < 30000

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-3 rounded-lg border transition-all duration-300',
                        getNotificationColor(notification.type, notification.urgent),
                        isRecent && 'ring-2 ring-blue-400 ring-opacity-50'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type, notification.urgent)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {notification.title}
                            </h4>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {notification.urgent && (
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                              )}
                              <span className="text-xs text-gray-500">
                                {formatTimestamp(notification.timestamp)}
                              </span>
                            </div>
                          </div>
                          
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {notification.message}
                          </p>

                          {/* Additional data if available */}
                          {notification.data && (
                            <div className="mt-2 text-xs text-gray-500">
                              {notification.data.pokemonName && (
                                <span>Pokémon: {notification.data.pokemonName}</span>
                              )}
                              {notification.data.bidAmount && (
                                <span className="ml-2">Amount: ${notification.data.bidAmount}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {/* Clear all button */}
            {notifications.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllNotifications}
                  className="w-full text-xs text-gray-600 hover:text-gray-800"
                >
                  <Archive className="h-3 w-3 mr-1" />
                  Clear All Notifications
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
