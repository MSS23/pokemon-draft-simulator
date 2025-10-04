'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Trophy,
  UserPlus,
  UserMinus,
  Gavel,
  Clock,
  Play,
  Pause,
  CheckCircle,
  Zap
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export interface ActivityEvent {
  id: string
  type: 'pick' | 'bid' | 'auction_start' | 'auction_end' | 'join' | 'leave' | 'draft_start' | 'draft_pause' | 'draft_complete' | 'turn_change'
  teamName?: string
  userName?: string
  pokemonName?: string
  pokemonId?: string
  amount?: number
  timestamp: string
  metadata?: Record<string, any>
}

interface ActivityFeedProps {
  activities: ActivityEvent[]
  maxItems?: number
  showTimestamps?: boolean
  compact?: boolean
}

export default function ActivityFeed({
  activities,
  maxItems = 50,
  showTimestamps = true,
  compact = false
}: ActivityFeedProps) {
  const [displayActivities, setDisplayActivities] = useState<ActivityEvent[]>([])

  useEffect(() => {
    // Sort by timestamp (newest first) and limit
    const sorted = [...activities]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, maxItems)
    setDisplayActivities(sorted)
  }, [activities, maxItems])

  const getActivityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'pick':
        return <Trophy className="w-4 h-4" />
      case 'bid':
        return <Gavel className="w-4 h-4" />
      case 'auction_start':
        return <Zap className="w-4 h-4" />
      case 'auction_end':
        return <CheckCircle className="w-4 h-4" />
      case 'join':
        return <UserPlus className="w-4 h-4" />
      case 'leave':
        return <UserMinus className="w-4 h-4" />
      case 'draft_start':
        return <Play className="w-4 h-4" />
      case 'draft_pause':
        return <Pause className="w-4 h-4" />
      case 'draft_complete':
        return <CheckCircle className="w-4 h-4" />
      case 'turn_change':
        return <Clock className="w-4 h-4" />
      default:
        return <Zap className="w-4 h-4" />
    }
  }

  const getActivityColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'pick':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
      case 'bid':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20'
      case 'auction_start':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20'
      case 'auction_end':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
      case 'join':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20'
      case 'leave':
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20'
      case 'draft_start':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
      case 'draft_pause':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
      case 'draft_complete':
        return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20'
      case 'turn_change':
        return 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20'
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20'
    }
  }

  const getActivityMessage = (activity: ActivityEvent) => {
    switch (activity.type) {
      case 'pick':
        return (
          <>
            <span className="font-semibold">{activity.teamName}</span>
            {' drafted '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {activity.pokemonName}
            </span>
          </>
        )
      case 'bid':
        return (
          <>
            <span className="font-semibold">{activity.teamName}</span>
            {' bid '}
            <span className="font-semibold">{activity.amount} points</span>
            {' on '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {activity.pokemonName}
            </span>
          </>
        )
      case 'auction_start':
        return (
          <>
            <span className="font-semibold">{activity.teamName}</span>
            {' nominated '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {activity.pokemonName}
            </span>
            {' for auction'}
          </>
        )
      case 'auction_end':
        return (
          <>
            <span className="font-semibold">{activity.teamName}</span>
            {' won '}
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {activity.pokemonName}
            </span>
            {activity.amount && ` for ${activity.amount} points`}
          </>
        )
      case 'join':
        return (
          <>
            <span className="font-semibold">{activity.userName}</span>
            {' joined the draft'}
          </>
        )
      case 'leave':
        return (
          <>
            <span className="font-semibold">{activity.userName}</span>
            {' left the draft'}
          </>
        )
      case 'draft_start':
        return <span className="font-semibold">Draft has started!</span>
      case 'draft_pause':
        return <span className="font-semibold">Draft paused</span>
      case 'draft_complete':
        return <span className="font-semibold">Draft completed!</span>
      case 'turn_change':
        return (
          <>
            {"It's "}
            <span className="font-semibold">{activity.teamName}</span>
            {"'s turn"}
          </>
        )
      default:
        return 'Unknown activity'
    }
  }

  if (displayActivities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No activity yet. Start drafting to see live updates!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Activity Feed</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {displayActivities.length} {displayActivities.length === 1 ? 'event' : 'events'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className={compact ? 'h-[300px]' : 'h-[500px]'}>
          <div className="px-6 pb-4 space-y-3">
            {displayActivities.map((activity, index) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 animate-in slide-in-from-top duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Avatar/Icon */}
                <Avatar className={`w-8 h-8 ${getActivityColor(activity.type)} border-2`}>
                  <AvatarFallback className={getActivityColor(activity.type)}>
                    {getActivityIcon(activity.type)}
                  </AvatarFallback>
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm leading-relaxed">
                    {getActivityMessage(activity)}
                  </div>
                  {showTimestamps && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
