'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Eye, 
  Users, 
  Clock, 
  Trophy, 
  Gavel, 
  Activity,
  MessageCircle,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { notificationService } from '@/lib/notification-service'

interface SpectatorModeProps {
  draftId: string
  currentPhase: 'setup' | 'drafting' | 'auction' | 'completed'
  participantCount: number
  currentAction?: {
    type: 'pick' | 'bid' | 'nominate'
    teamName: string
    pokemonName?: string
    timeRemaining?: number
  }
  recentActivity: Array<{
    id: string
    type: 'pick' | 'bid' | 'auction_start' | 'auction_end' | 'join' | 'leave'
    teamName: string
    pokemonName?: string
    amount?: number
    timestamp: string
  }>
  onRequestNotifications?: () => void
  className?: string
}

export default function SpectatorMode({
  draftId,
  currentPhase,
  participantCount,
  currentAction,
  recentActivity,
  onRequestNotifications,
  className
}: SpectatorModeProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')

  // Check notification permissions on mount
  useEffect(() => {
    const permissionStatus = notificationService.getPermissionStatus()
    setNotificationsEnabled(permissionStatus.granted)
  }, [])

  // Monitor connection status
  useEffect(() => {
    // Simulate connection monitoring
    setConnectionStatus('connected')
    
    const interval = setInterval(() => {
      // In real implementation, this would check actual connection
      setConnectionStatus('connected')
    }, 5000)

    return () => clearInterval(interval)
  }, [draftId])

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled && onRequestNotifications) {
      onRequestNotifications()
      const success = await notificationService.requestPermission()
      setNotificationsEnabled(success)
    } else {
      setNotificationsEnabled(!notificationsEnabled)
    }
  }

  const handleToggleSound = () => {
    const newState = !soundEnabled
    setSoundEnabled(newState)
    notificationService.setSoundEnabled(newState)
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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'pick':
        return <Trophy className="h-4 w-4 text-green-600" />
      case 'bid':
        return <Gavel className="h-4 w-4 text-orange-600" />
      case 'auction_start':
        return <Gavel className="h-4 w-4 text-blue-600" />
      case 'auction_end':
        return <Trophy className="h-4 w-4 text-purple-600" />
      case 'join':
        return <Users className="h-4 w-4 text-green-500" />
      case 'leave':
        return <Users className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getPhaseDisplay = () => {
    switch (currentPhase) {
      case 'setup':
        return { text: 'Setting Up', color: 'bg-yellow-100 text-yellow-800' }
      case 'drafting':
        return { text: 'Snake Draft', color: 'bg-blue-100 text-blue-800' }
      case 'auction':
        return { text: 'Auction Draft', color: 'bg-orange-100 text-orange-800' }
      case 'completed':
        return { text: 'Completed', color: 'bg-green-100 text-green-800' }
      default:
        return { text: 'Unknown', color: 'bg-gray-100 text-gray-800' }
    }
  }

  const phase = getPhaseDisplay()

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-blue-600" />
            Spectator Mode
            <Badge variant="outline" className={phase.color}>
              {phase.text}
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-1">
            {/* Connection Status */}
            <div className={cn(
              'flex items-center gap-1 text-xs px-2 py-1 rounded',
              connectionStatus === 'connected' && 'bg-green-100 text-green-700',
              connectionStatus === 'connecting' && 'bg-yellow-100 text-yellow-700',
              connectionStatus === 'disconnected' && 'bg-red-100 text-red-700'
            )}>
              <div className={cn(
                'w-2 h-2 rounded-full',
                connectionStatus === 'connected' && 'bg-green-500',
                connectionStatus === 'connecting' && 'bg-yellow-500 animate-pulse',
                connectionStatus === 'disconnected' && 'bg-red-500'
              )} />
              {connectionStatus === 'connected' ? 'Live' : 
               connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
            </div>

            {/* Expand/Collapse */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{participantCount} participants</span>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            <span>{recentActivity.length} recent events</span>
          </div>
        </div>

        {/* Current Action */}
        {currentAction && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentAction.type === 'pick' && <Trophy className="h-4 w-4 text-green-600" />}
                {currentAction.type === 'bid' && <Gavel className="h-4 w-4 text-orange-600" />}
                {currentAction.type === 'nominate' && <Gavel className="h-4 w-4 text-blue-600" />}
                
                <div>
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {currentAction.teamName} is {currentAction.type === 'pick' ? 'picking' : 
                     currentAction.type === 'bid' ? 'bidding on' : 'nominating'} 
                    {currentAction.pokemonName && ` ${currentAction.pokemonName}`}
                  </div>
                  {currentAction.timeRemaining && (
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {currentAction.timeRemaining}s remaining
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Controls */}
        <div className="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleNotifications}
            className="text-xs"
          >
            <MessageCircle className="h-3 w-3 mr-1" />
            {notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleSound}
            className="text-xs"
          >
            {soundEnabled ? <Volume2 className="h-3 w-3 mr-1" /> : <VolumeX className="h-3 w-3 mr-1" />}
            Sound {soundEnabled ? 'On' : 'Off'}
          </Button>
        </div>

        {/* Activity Feed */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Recent Activity
          </h4>
          
          {recentActivity.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
              <p className="text-xs mt-1">Draft events will appear here</p>
            </div>
          ) : (
            <ScrollArea className={cn(
              'transition-all duration-300',
              isExpanded ? 'h-64' : 'h-32'
            )}>
              <div className="space-y-1">
                {recentActivity.slice(0, isExpanded ? 50 : 10).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800"
                  >
                    {getActivityIcon(activity.type)}
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        <span className="font-medium">{activity.teamName}</span>
                        <span className="text-gray-600 dark:text-gray-400 ml-1">
                          {activity.type === 'pick' && `picked ${activity.pokemonName}`}
                          {activity.type === 'bid' && `bid $${activity.amount} on ${activity.pokemonName}`}
                          {activity.type === 'auction_start' && `started auction for ${activity.pokemonName}`}
                          {activity.type === 'auction_end' && `won ${activity.pokemonName} for $${activity.amount}`}
                          {activity.type === 'join' && 'joined the draft'}
                          {activity.type === 'leave' && 'left the draft'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 flex-shrink-0">
                      {formatTimestamp(activity.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Spectator Info */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
              👁️ Spectator Mode Active
            </h4>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <li>• You're watching this draft in real-time</li>
              <li>• Enable notifications to stay updated when the tab is inactive</li>
              <li>• All picks, bids, and auction results are shown as they happen</li>
              <li>• Join as a participant next time to play!</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
