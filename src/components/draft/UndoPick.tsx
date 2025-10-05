'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Undo2, AlertCircle, CheckCircle } from 'lucide-react'
import { UndoService } from '@/lib/undo-service'
import { useNotify } from '@/components/providers/NotificationProvider'

interface UndoPickProps {
  draftId: string
  teamId: string
  participantId: string
  isMyTurn: boolean
  onUndoComplete?: () => void
  className?: string
}

export default function UndoPick({
  draftId,
  teamId,
  participantId,
  isMyTurn,
  onUndoComplete,
  className
}: UndoPickProps) {
  const [undosRemaining, setUndosRemaining] = useState<number>(0)
  const [isUndoing, setIsUndoing] = useState(false)
  const [lastUndoMessage, setLastUndoMessage] = useState<string | null>(null)
  const notify = useNotify()

  useEffect(() => {
    loadUndosRemaining()
  }, [teamId])

  const loadUndosRemaining = async () => {
    const remaining = await UndoService.getUndosRemaining(teamId)
    setUndosRemaining(remaining)
  }

  const handleUndo = async () => {
    if (!isMyTurn) {
      notify.warning('Not Your Turn', 'You can only undo during your turn')
      return
    }

    if (undosRemaining <= 0) {
      notify.warning('No Undos Left', 'Your team has used all available undos')
      return
    }

    setIsUndoing(true)
    setLastUndoMessage(null)

    try {
      const result = await UndoService.undoLastPick({
        draftId,
        teamId,
        participantId
      })

      if (result.success) {
        notify.success('Pick Undone', result.message)
        setLastUndoMessage(result.message)
        setUndosRemaining(prev => prev - 1)
        onUndoComplete?.()
      } else {
        notify.error('Undo Failed', result.message)
        setLastUndoMessage(result.message)
      }
    } catch (error) {
      notify.error('Undo Failed', 'An unexpected error occurred')
      setLastUndoMessage('An unexpected error occurred')
    } finally {
      setIsUndoing(false)
    }
  }

  const getUndosBadgeColor = () => {
    if (undosRemaining === 0) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    if (undosRemaining === 1) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  }

  return (
    <Card className={`p-4 bg-white dark:bg-slate-800 ${className}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Undo2 className="h-4 w-4" />
              Undo Last Pick
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Reverse your most recent selection
            </p>
          </div>
          <Badge className={getUndosBadgeColor()}>
            {undosRemaining} left
          </Badge>
        </div>

        {/* Undo Button */}
        <Button
          onClick={handleUndo}
          disabled={isUndoing || undosRemaining === 0 || !isMyTurn}
          variant="outline"
          className="w-full"
        >
          <Undo2 className="h-4 w-4 mr-2" />
          {isUndoing ? 'Undoing...' : 'Undo Last Pick'}
        </Button>

        {/* Status Messages */}
        {!isMyTurn && (
          <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              You can only undo during your turn
            </p>
          </div>
        )}

        {undosRemaining === 0 && (
          <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">
              No undos remaining for your team
            </p>
          </div>
        )}

        {lastUndoMessage && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
            <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {lastUndoMessage}
            </p>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p>💡 Use undos strategically - each team has a limited number</p>
        </div>
      </div>
    </Card>
  )
}
