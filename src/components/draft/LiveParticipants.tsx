'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Users,
  Crown,
  Eye,
  Wifi,
  WifiOff,
  Clock,
  MessageCircle,
  Activity,
  UserX
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Participant {
  id: string
  userId: string
  displayName: string
  teamId: string | null
  teamName: string | null
  isHost: boolean
  lastSeen: string
  isOnline: boolean
  isCurrentTurn?: boolean
  isSpectator?: boolean
}

interface LiveParticipantsProps {
  participants: Participant[]
  currentUserId: string
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  onKickUser?: (userId: string) => void
  onPromoteToHost?: (userId: string) => void
  isHost: boolean
  className?: string
}

export default function LiveParticipants({
  participants,
  currentUserId,
  draftStatus,
  onKickUser,
  onPromoteToHost,
  isHost,
  className
}: LiveParticipantsProps) {
  const [showOffline, setShowOffline] = useState(false)

  const getTimeAgo = (timestamp: string) => {
    const now = Date.now()
    const time = new Date(timestamp).getTime()
    const diff = Math.floor((now - time) / 1000)

    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const isOnline = (lastSeen: string) => {
    const diff = Date.now() - new Date(lastSeen).getTime()
    return diff < 60000 // Online if seen within last minute
  }

  const onlineParticipants = participants.filter(p => isOnline(p.lastSeen))
  const offlineParticipants = participants.filter(p => !isOnline(p.lastSeen))
  const spectators = participants.filter(p => p.isSpectator)
  const activePlayers = participants.filter(p => !p.isSpectator && p.teamId)

  const getStatusIcon = (participant: Participant) => {
    if (participant.isCurrentTurn && draftStatus === 'drafting') {
      return <Activity className="h-3 w-3 text-green-500 animate-pulse" />
    }
    if (isOnline(participant.lastSeen)) {
      return <Wifi className="h-3 w-3 text-green-500" />
    }
    return <WifiOff className="h-3 w-3 text-gray-400" />
  }

  const getParticipantInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Live Participants
            <Badge variant="outline" className="text-xs">
              {onlineParticipants.length} online
            </Badge>
          </div>
          {offlineParticipants.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOffline(!showOffline)}
              className="text-xs"
            >
              {showOffline ? 'Hide' : 'Show'} Offline ({offlineParticipants.length})
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Active Players */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Draft Participants ({activePlayers.length})
          </h4>
          <div className="space-y-1">
            {activePlayers.map((participant) => (
              <div
                key={participant.id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg border transition-all duration-200',
                  participant.userId === currentUserId
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : isOnline(participant.lastSeen)
                    ? 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60',
                  participant.isCurrentTurn && 'ring-2 ring-green-400 ring-opacity-50'
                )}
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.displayName}`} />
                    <AvatarFallback className="text-xs">
                      {getParticipantInitials(participant.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    {getStatusIcon(participant)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {participant.displayName}
                    </span>
                    {participant.userId === currentUserId && (
                      <Badge variant="secondary" className="text-xs">You</Badge>
                    )}
                    {participant.isHost && (
                      <Crown className="h-3 w-3 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{participant.teamName || 'No team'}</span>
                    {participant.isCurrentTurn && draftStatus === 'drafting' && (
                      <Badge className="bg-green-100 text-green-800 text-xs px-1 py-0">
                        Turn
                      </Badge>
                    )}
                    {!isOnline(participant.lastSeen) && (
                      <span className="text-gray-400">
                        Last seen {getTimeAgo(participant.lastSeen)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Host controls */}
                {isHost && participant.userId !== currentUserId && (
                  <div className="flex items-center gap-1">
                    {!participant.isHost && onPromoteToHost && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPromoteToHost(participant.userId)}
                        className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
                        title="Promote to host"
                      >
                        <Crown className="h-3 w-3" />
                      </Button>
                    )}
                    {onKickUser && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onKickUser(participant.userId)}
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                        title="Remove from draft"
                      >
                        <UserX className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Spectators */}
        {spectators.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Spectators ({spectators.length})
            </h4>
            <div className="space-y-1">
              {spectators.map((spectator) => (
                <div
                  key={spectator.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${spectator.displayName}`} />
                    <AvatarFallback className="text-xs">
                      {getParticipantInitials(spectator.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {spectator.displayName}
                  </span>
                  <div className="ml-auto">
                    {getStatusIcon(spectator)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offline participants (collapsed by default) */}
        {showOffline && offlineParticipants.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Offline ({offlineParticipants.length})
            </h4>
            <div className="space-y-1 opacity-60">
              {offlineParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <Avatar className="h-6 w-6 grayscale">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.displayName}`} />
                    <AvatarFallback className="text-xs">
                      {getParticipantInitials(participant.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="text-sm text-gray-500">
                      {participant.displayName}
                    </span>
                    <div className="text-xs text-gray-400">
                      {getTimeAgo(participant.lastSeen)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connection stats */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Total: {participants.length}</span>
            <span>Online: {onlineParticipants.length}</span>
            <span>Active: {activePlayers.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}