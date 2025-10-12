'use client'

import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { usePresence } from '@/hooks/useRealtimeSubscription'

interface OnlineUsersProps {
  draftId: string
  userId: string
  participants: Array<{
    user_id: string | null
    display_name: string
    team_id: string | null
  }>
  compact?: boolean
}

/**
 * Online Users Component
 *
 * Shows who's currently online in the draft using real-time presence
 */
export function OnlineUsers({ draftId, userId, participants, compact = false }: OnlineUsersProps) {
  const { onlineUsers, onlineCount } = usePresence(draftId, userId, {
    timestamp: Date.now()
  })

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-muted-foreground">
          {onlineCount} online
        </span>
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Online</span>
          <Badge variant="secondary" className="ml-1">
            {onlineCount}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm mb-2">Online Participants</h4>
            <p className="text-xs text-muted-foreground mb-3">
              {onlineCount} {onlineCount === 1 ? 'person' : 'people'} currently viewing this draft
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {participants.map((participant) => {
              const isOnline = participant.user_id ? onlineUsers.includes(participant.user_id) : false
              const isCurrentUser = participant.user_id === userId

              return (
                <div
                  key={participant.user_id || Math.random()}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-sm font-medium truncate">
                      {participant.display_name}
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground ml-1">(you)</span>
                      )}
                    </span>
                  </div>
                  <Badge
                    variant={isOnline ? 'default' : 'secondary'}
                    className="text-xs flex-shrink-0"
                  >
                    {isOnline ? 'Online' : 'Away'}
                  </Badge>
                </div>
              )
            })}
          </div>

          {onlineCount === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No participants online
            </div>
          )}

          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>Updates in real-time using presence tracking</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
