'use client'

// Cache bust: 2025-10-13-fix-infinite-loop
import { useState, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  Trash2,
  Shuffle
} from 'lucide-react'
import { notify } from '@/lib/notifications'

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
  isAdmin?: boolean
  isStarting?: boolean
  timeRemaining?: number
  onStartDraft: () => void
  onShuffleDraftOrder?: () => void
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
  isShuffling?: boolean
  onUndoLastPick?: () => void
  onRequestNotificationPermission?: () => void
  onPingCurrentPlayer?: () => void
  canUndo?: boolean
  notificationsEnabled?: boolean
}

const DraftControls = memo(function DraftControls({
  draftStatus,
  currentTurn,
  totalTeams,
  currentTeam: _currentTeam,
  teams,
  isHost,
  isAdmin = false,
  isStarting = false,
  timeRemaining = 60,
  onStartDraft,
  onShuffleDraftOrder,
  onPauseDraft,
  onResumeDraft,
  onEndDraft,
  onResetDraft,
  onDeleteDraft,
  onAdvanceTurn,
  onSetTimer,
  onEnableProxyPicking: _onEnableProxyPicking,
  onDisableProxyPicking: _onDisableProxyPicking,
  isProxyPickingEnabled: _isProxyPickingEnabled = false,
  isShuffling = false,
  onUndoLastPick,
  onRequestNotificationPermission,
  onPingCurrentPlayer,
  canUndo = false,
  notificationsEnabled = false
}: DraftControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    confirmLabel: string
    variant: 'default' | 'destructive'
    onConfirm: () => void
  } | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const handlePauseDraft = () => {
    onPauseDraft()
    notify.warning('Draft Paused', 'The draft has been paused by the host')
  }

  const handleResumeDraft = () => {
    onResumeDraft()
    notify.success('Draft Resumed', 'The draft has been resumed')
  }

  const handleEndDraft = () => {
    setConfirmAction({
      title: 'End Draft',
      description: 'Are you sure you want to end this draft? This action cannot be undone.',
      confirmLabel: 'End Draft',
      variant: 'destructive',
      onConfirm: () => {
        onEndDraft()
        notify.info('Draft Ended', 'The draft has been ended by the host')
      },
    })
  }

  const handleAdvanceTurn = () => {
    setConfirmAction({
      title: 'Skip Turn',
      description: 'Are you sure you want to skip the current turn?',
      confirmLabel: 'Skip Turn',
      variant: 'default',
      onConfirm: () => {
        onAdvanceTurn()
        notify.warning('Turn Skipped', 'The current turn has been skipped')
      },
    })
  }

  const handleSetTimer = useCallback((value: string) => {
    const seconds = parseInt(value)
    onSetTimer(seconds)
    // Don't show notification immediately - it causes re-renders
  }, [onSetTimer])

  const handleUndo = () => {
    setConfirmAction({
      title: 'Undo Last Pick',
      description: 'Are you sure you want to undo the last pick?',
      confirmLabel: 'Undo Pick',
      variant: 'default',
      onConfirm: () => {
        if (onUndoLastPick) {
          onUndoLastPick()
          notify.info('Pick Undone', 'The last pick has been undone')
        }
      },
    })
  }

  const handleRequestNotifications = () => {
    if (onRequestNotificationPermission) {
      onRequestNotificationPermission()
    }
  }

  const handleShuffleDraftOrder = () => {
    if (onShuffleDraftOrder) {
      onShuffleDraftOrder()
      notify.success('Draft Order Shuffled', 'Team draft order has been randomized')
    }
  }

  const handleResetDraft = () => {
    setConfirmAction({
      title: 'Reset Draft',
      description: 'Are you sure you want to RESET this draft? This will delete all picks and teams will keep their positions. This action cannot be undone!',
      confirmLabel: 'Reset Draft',
      variant: 'destructive',
      onConfirm: () => {
        if (onResetDraft) {
          onResetDraft()
          notify.warning('Draft Reset', 'All picks have been cleared. Teams remain but draft is back to setup.')
        }
      },
    })
  }

  const handleDeleteDraft = () => {
    setDeleteConfirmInput('')
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirmed = () => {
    if (deleteConfirmInput === 'DELETE' && onDeleteDraft) {
      setShowDeleteConfirm(false)
      setDeleteConfirmInput('')
      notify.info('Deleting Draft...', 'Notifying all participants and cleaning up data')
      onDeleteDraft()
    }
  }


  if (!isHost && !isAdmin) {
    return null // Only show to hosts and admins
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-600" />
          Draft Controls
          <Badge variant="secondary" className="text-xs">{isHost ? 'Host' : 'Admin'}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Primary Controls */}
        <div className="flex gap-2 flex-wrap">
          {draftStatus === 'waiting' && (
            <>
              <Button
                onClick={handleShuffleDraftOrder}
                disabled={teams.length < 2 || !onShuffleDraftOrder || isShuffling}
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Shuffle className={`h-4 w-4 mr-2 ${isShuffling ? 'animate-spin' : ''}`} />
                {isShuffling ? 'Shuffling...' : 'Shuffle Draft Order'}
              </Button>
              <Button
                onClick={onStartDraft}
                disabled={teams.length < 2 || isStarting}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className={`h-4 w-4 mr-2 ${isStarting ? 'animate-spin' : ''}`} />
                {isStarting ? 'Starting...' : `Start Draft (${teams.length} teams)`}
              </Button>
            </>
          )}

          {draftStatus === 'drafting' && (
            <>
              {onPingCurrentPlayer && (
                <Button
                  onClick={onPingCurrentPlayer}
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Ping Player
                </Button>
              )}

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
                  <span className="text-xs text-gray-500">Skip current player&apos;s turn</span>
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
                  <span className="text-xs text-gray-500">Get notified when it&apos;s your turn</span>
                </div>
              </div>
            )}

            {/* Timer Controls */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Turn Timer: {timeRemaining}s
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 90, 120, 180, 300, 0].map(seconds => (
                  <Button
                    key={seconds}
                    variant={timeRemaining === seconds ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSetTimer(String(seconds))}
                    className="text-xs"
                  >
                    {seconds === 0 ? 'None' : `${seconds}s`}
                  </Button>
                ))}
              </div>
            </div>

            {/* Danger Zone - Host Only */}
            {isHost && (
            <div className="space-y-3 pt-3 border-t-2 border-red-200 dark:border-red-800">
              <h4 className="font-medium text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Danger Zone (Host Only)
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
            )}

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

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.confirmLabel}
        variant={confirmAction?.variant}
        onConfirm={() => {
          confirmAction?.onConfirm()
          setConfirmAction(null)
        }}
      />

      {/* Delete Draft Dialog (requires typing DELETE) */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Permanently</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Remove the draft room</li>
                  <li>Kick out all participants</li>
                  <li>Remove it from everyone&apos;s draft list</li>
                </ul>
                <p className="font-medium">This action CANNOT be undone!</p>
                <div className="pt-2">
                  <label className="text-sm font-medium">
                    Type &quot;DELETE&quot; to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="DELETE"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmInput('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              disabled={deleteConfirmInput !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
})

export default DraftControls