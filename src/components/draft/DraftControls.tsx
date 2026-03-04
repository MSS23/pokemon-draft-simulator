'use client'

import { useState, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
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
  ChevronDown,
  ChevronUp,
  Timer,
  Crown,
  Undo,
  Bell,
  RotateCcw,
  Trash2,
  Shuffle
} from 'lucide-react'
import { notify } from '@/lib/notifications'
import { cn } from '@/lib/utils'

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
  currentTurn: _currentTurn,
  totalTeams: _totalTeams,
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
  const [isExpanded, setIsExpanded] = useState(false)
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
          notify.warning('Draft Reset', 'All picks have been cleared.')
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
    return null
  }

  return (
    <>
      {/* Collapsed bar with primary actions */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          <Crown className="h-4 w-4 text-yellow-600 flex-shrink-0" />
          <span className="text-sm font-medium text-muted-foreground flex-shrink-0">
            {isHost ? 'Host' : 'Admin'}
          </span>

          {/* Primary actions - scrollable on mobile */}
          <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
            {draftStatus === 'waiting' && (
              <>
                <Button
                  onClick={handleShuffleDraftOrder}
                  disabled={teams.length < 2 || !onShuffleDraftOrder || isShuffling}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs flex-shrink-0"
                >
                  <Shuffle className={cn('h-3.5 w-3.5 mr-1', isShuffling && 'animate-spin')} />
                  <span className="hidden sm:inline">Shuffle</span>
                </Button>
                <Button
                  onClick={onStartDraft}
                  disabled={teams.length < 2 || isStarting}
                  size="sm"
                  className="h-9 text-xs bg-green-600 hover:bg-green-700 flex-shrink-0"
                >
                  <Play className={cn('h-3.5 w-3.5 mr-1', isStarting && 'animate-spin')} />
                  {isStarting ? 'Starting...' : `Start (${teams.length})`}
                </Button>
              </>
            )}

            {draftStatus === 'drafting' && (
              <>
                {onPingCurrentPlayer && (
                  <Button onClick={onPingCurrentPlayer} variant="outline" size="sm" className="h-9 text-xs flex-shrink-0">
                    <Bell className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Ping</span>
                  </Button>
                )}
                {canUndo && onUndoLastPick && (
                  <Button onClick={handleUndo} variant="outline" size="sm" className="h-9 text-xs flex-shrink-0">
                    <Undo className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Undo</span>
                  </Button>
                )}
                <Button onClick={handleAdvanceTurn} variant="outline" size="sm" className="h-9 text-xs flex-shrink-0">
                  <SkipForward className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Skip</span>
                </Button>
                <Button onClick={handlePauseDraft} variant="outline" size="sm" className="h-9 w-9 p-0 flex-shrink-0">
                  <Pause className="h-3.5 w-3.5" />
                </Button>
                <Button onClick={handleEndDraft} variant="destructive" size="sm" className="h-9 w-9 p-0 flex-shrink-0">
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {draftStatus === 'paused' && (
              <Button onClick={handleResumeDraft} size="sm" className="h-9 text-xs bg-green-600 hover:bg-green-700 flex-shrink-0">
                <Play className="h-3.5 w-3.5 mr-1" />
                Resume
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-9 w-9 p-0 flex-shrink-0"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div className="border-t px-3 py-3 space-y-3">
            {/* Timer Controls */}
            {draftStatus === 'drafting' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Turn Timer: {timeRemaining}s
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[30, 60, 90, 120, 180, 300, 0].map(seconds => (
                    <Button
                      key={seconds}
                      variant={timeRemaining === seconds ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSetTimer(String(seconds))}
                      className="h-9 text-xs px-3"
                    >
                      {seconds === 0 ? 'None' : `${seconds}s`}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Notification Permission */}
            {!notificationsEnabled && onRequestNotificationPermission && (
              <Button
                onClick={onRequestNotificationPermission}
                variant="outline"
                size="sm"
                className="h-9 text-xs"
              >
                <Bell className="h-3.5 w-3.5 mr-1.5" />
                Enable Notifications
              </Button>
            )}

            {/* Danger Zone - Host Only */}
            {isHost && (
              <div className="pt-2 border-t border-destructive/20 space-y-2">
                <span className="text-xs font-medium text-destructive">Danger Zone</span>
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    onClick={handleResetDraft}
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={!onResetDraft}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                  <Button
                    onClick={handleDeleteDraft}
                    variant="destructive"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={!onDeleteDraft}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Delete Draft Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Permanently</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will remove the draft, kick all participants, and delete all data.</p>
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
    </>
  )
})

export default DraftControls
