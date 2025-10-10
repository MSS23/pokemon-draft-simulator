'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Play,
  Pause,
  Square,
  SkipForward,
  Settings,
  Timer,
  Crown,
  Users,
  AlertCircle,
  Undo,
  Bell,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { useNotify } from '@/components/providers/NotificationProvider'

interface DraftControlsProps {
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  currentTurn: number
  totalTeams: number
  currentTeam: string | null
  teams: Array<{
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
  }>
  isHost: boolean
  timeRemaining?: number
  onStartDraft: () => void
  onPauseDraft: () => void
  onResumeDraft: () => void
  onEndDraft: () => void
  onResetDraft?: () => void
  onDeleteDraft?: () => void
  onAdvanceTurn: () => void
  onSetTimer: (seconds: number) => void
  onEnableProxyPicking?: () => void
  onDisableProxyPicking?: () => void
  isProxyPickingEnabled?: boolean
  onUndoLastPick?: () => void
  onRequestNotificationPermission?: () => void
  canUndo?: boolean
  notificationsEnabled?: boolean
}

export default function DraftControls({
  draftStatus,
  currentTurn,
  totalTeams,
  currentTeam,
  teams,
  isHost,
  timeRemaining = 60,
  onStartDraft,
  onPauseDraft,
  onResumeDraft,
  onEndDraft,
  onResetDraft,
  onDeleteDraft,
  onAdvanceTurn,
  onSetTimer,
  onEnableProxyPicking,
  onDisableProxyPicking,
  isProxyPickingEnabled = false,
  onUndoLastPick,
  onRequestNotificationPermission,
  canUndo = false,
  notificationsEnabled = false
}: DraftControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [timerValue, setTimerValue] = useState('60')
  const notify = useNotify()

  const handlePauseDraft = () => {
    onPauseDraft()
    notify.warning('Draft Paused', 'The draft has been paused by the host')
  }

  const handleResumeDraft = () => {
    onResumeDraft()
    notify.success('Draft Resumed', 'The draft has been resumed')
  }

  const handleEndDraft = () => {
    if (window.confirm('Are you sure you want to end this draft? This action cannot be undone.')) {
      onEndDraft()
      notify.info('Draft Ended', 'The draft has been ended by the host')
    }
  }

  const handleAdvanceTurn = () => {
    if (window.confirm('Are you sure you want to skip the current turn?')) {
      onAdvanceTurn()
      notify.warning('Turn Skipped', 'The current turn has been skipped')
    }
  }

  const handleSetTimer = (value: string) => {
    const seconds = parseInt(value)
    onSetTimer(seconds)
    setTimerValue(value)
    notify.info('Timer Updated', `Turn timer set to ${seconds} seconds`)
  }

  const handleEnableProxyPicking = () => {
    if (onEnableProxyPicking) {
      onEnableProxyPicking()
      notify.success('Proxy Picking Enabled', 'You can now pick Pokémon for other teams')
    }
  }

  const handleDisableProxyPicking = () => {
    if (onDisableProxyPicking) {
      onDisableProxyPicking()
      notify.info('Proxy Picking Disabled', 'Proxy picking has been turned off')
    }
  }

  const handleUndo = () => {
    if (window.confirm('Are you sure you want to undo the last pick?')) {
      if (onUndoLastPick) {
        onUndoLastPick()
        notify.info('Pick Undone', 'The last pick has been undone')
      }
    }
  }

  const handleRequestNotifications = () => {
    if (onRequestNotificationPermission) {
      onRequestNotificationPermission()
    }
  }

  const handleResetDraft = () => {
    if (window.confirm('Are you sure you want to RESET this draft? This will delete all picks and teams will keep their positions. This action cannot be undone!')) {
      if (onResetDraft) {
        onResetDraft()
        notify.warning('Draft Reset', 'All picks have been cleared. Teams remain but draft is back to setup.')
      }
    }
  }

  const handleDeleteDraft = () => {
    const confirmed = window.confirm('⚠️ DANGER: Are you sure you want to DELETE this entire draft?\n\nThis will permanently delete:\n- All teams\n- All picks\n- All participants\n- The entire draft room\n\nThis action CANNOT be undone!')

    if (confirmed) {
      const doubleConfirm = window.prompt('Type "DELETE" to confirm permanent deletion:')
      if (doubleConfirm === 'DELETE') {
        if (onDeleteDraft) {
          onDeleteDraft()
          notify.error('Draft Deleted', 'The draft has been permanently deleted')
        }
      } else {
        notify.info('Cancelled', 'Draft deletion cancelled')
      }
    }
  }


  if (!isHost) {
    return null // Only show to hosts
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-600" />
          Draft Controls
          <Badge variant="secondary" className="text-xs">Host Only</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Primary Controls */}
        <div className="flex gap-2 flex-wrap">
          {draftStatus === 'waiting' && (
            <Button
              onClick={onStartDraft}
              disabled={teams.length < 2}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Draft ({teams.length} teams)
            </Button>
          )}

          {draftStatus === 'drafting' && (
            <>
              <Button
                onClick={handlePauseDraft}
                variant="outline"
                className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>

              <Button
                onClick={handleEndDraft}
                variant="destructive"
              >
                <Square className="h-4 w-4 mr-2" />
                End Draft
              </Button>
            </>
          )}

          {draftStatus === 'paused' && (
            <Button
              onClick={handleResumeDraft}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Resume Draft
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Settings className="h-4 w-4 mr-2" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </Button>
        </div>

        {/* Draft Status Info */}
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{teams.length} teams</span>
          </div>

          {draftStatus === 'drafting' && (
            <>
              <div className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                <span>{timeRemaining}s remaining</span>
              </div>
              <div>
                Turn {currentTurn} of {totalTeams * 6}
              </div>
            </>
          )}
        </div>

        {/* Advanced Controls */}
        {showAdvanced && (
          <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Advanced Controls</h4>

            {/* Turn Controls */}
            {draftStatus === 'drafting' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAdvanceTurn}
                    variant="outline"
                    size="sm"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip Turn
                  </Button>
                  <span className="text-xs text-gray-500">Skip current player's turn</span>
                </div>
              </div>
            )}


            {/* Undo Controls */}
            {draftStatus === 'drafting' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleUndo}
                    variant="outline"
                    size="sm"
                    disabled={!canUndo}
                    className="border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                  >
                    <Undo className="h-4 w-4 mr-1" />
                    Undo Last Pick
                  </Button>
                  <span className="text-xs text-gray-500">Remove the most recent pick</span>
                </div>
              </div>
            )}

            {/* Notification Permission */}
            {!notificationsEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleRequestNotifications}
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    <Bell className="h-4 w-4 mr-1" />
                    Enable Notifications
                  </Button>
                  <span className="text-xs text-gray-500">Get notified when it's your turn</span>
                </div>
              </div>
            )}

            {/* Proxy Picking Controls */}
            {draftStatus === 'drafting' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Proxy Picking
                </label>
                <div className="flex items-center gap-2">
                  {!isProxyPickingEnabled ? (
                    <Button
                      onClick={handleEnableProxyPicking}
                      variant="outline"
                      size="sm"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Enable Proxy Picking
                    </Button>
                  ) : (
                    <Button
                      onClick={handleDisableProxyPicking}
                      variant="outline"
                      size="sm"
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Disable Proxy Picking
                    </Button>
                  )}
                  <span className="text-xs text-gray-500">
                    {isProxyPickingEnabled ? 'You can pick for any team' : 'Pick Pokémon for other players'}
                  </span>
                </div>
                {isProxyPickingEnabled && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                    <strong>Proxy picking enabled:</strong> You can now select Pokémon for any team when it's their turn.
                    Click on a Pokémon and it will be drafted for the current team.
                  </div>
                )}
              </div>
            )}

            {/* Timer Controls */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Turn Timer
              </label>
              <div className="flex items-center gap-2">
                <Select value={timerValue} onValueChange={handleSetTimer}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="90">90 seconds</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                    <SelectItem value="180">3 minutes</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                    <SelectItem value="0">No timer</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-gray-500">Time limit per turn</span>
              </div>
            </div>

            {/* Danger Zone - Admin Controls */}
            <div className="space-y-3 pt-3 border-t-2 border-red-200 dark:border-red-800">
              <h4 className="font-medium text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Danger Zone
              </h4>

              {/* Reset Draft */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleResetDraft}
                    variant="outline"
                    size="sm"
                    className="border-orange-400 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400"
                    disabled={!onResetDraft}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset Draft
                  </Button>
                  <span className="text-xs text-gray-500">Clear all picks, keep teams</span>
                </div>
              </div>

              {/* Delete Draft */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDeleteDraft}
                    variant="destructive"
                    size="sm"
                    disabled={!onDeleteDraft}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Draft Permanently
                  </Button>
                  <span className="text-xs text-gray-500">Remove entire draft and all data</span>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Use with caution:</strong> Advanced controls can disrupt the draft flow.
                Only use these if necessary to resolve issues or maintain fair play.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}