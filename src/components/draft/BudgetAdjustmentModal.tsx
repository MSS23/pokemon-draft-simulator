'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DollarSign, AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Team {
  id: string
  name: string
  budgetRemaining: number
  draftOrder: number
}

interface BudgetAdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  teams: Team[]
  onAdjustBudget: (teamId: string, newBudget: number) => Promise<void>
}

export default function BudgetAdjustmentModal({
  isOpen,
  onClose,
  teams,
  onAdjustBudget
}: BudgetAdjustmentModalProps) {
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [savedTeams, setSavedTeams] = useState<Set<string>>(new Set())

  // Initialize budget values when teams change
  useEffect(() => {
    const initialValues: Record<string, string> = {}
    teams.forEach(team => {
      initialValues[team.id] = team.budgetRemaining.toString()
    })
    setBudgetValues(initialValues)
    setSavedTeams(new Set())
  }, [teams])

  const handleBudgetChange = (teamId: string, value: string) => {
    setBudgetValues(prev => ({ ...prev, [teamId]: value }))
    // Remove from saved teams when value changes
    setSavedTeams(prev => {
      const newSet = new Set(prev)
      newSet.delete(teamId)
      return newSet
    })
  }

  const handleAdjustTeamBudget = async (teamId: string) => {
    const budget = parseInt(budgetValues[teamId])
    if (isNaN(budget) || budget < 0) return

    try {
      setIsSaving(true)
      await onAdjustBudget(teamId, budget)
      setSavedTeams(prev => new Set(prev).add(teamId))
    } catch (error) {
      console.error('Error adjusting budget:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Adjust Team Budgets
          </DialogTitle>
          <DialogDescription>
            Modify the budget for each team. Changes are saved individually per team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {sortedTeams.map(team => {
            const currentValue = budgetValues[team.id] || '0'
            const parsedValue = parseInt(currentValue)
            const hasChanged = parsedValue !== team.budgetRemaining
            const isValid = !isNaN(parsedValue) && parsedValue >= 0
            const isSaved = savedTeams.has(team.id)

            return (
              <div
                key={team.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-lg border transition-colors",
                  isSaved && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono">
                      #{team.draftOrder}
                    </Badge>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {team.name}
                    </span>
                    {isSaved && (
                      <Badge variant="default" className="bg-green-600 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Saved
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-slate-600 dark:text-slate-400 min-w-[120px]">
                      Current: {team.budgetRemaining} points
                    </Label>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="number"
                        min="0"
                        value={currentValue}
                        onChange={(e) => handleBudgetChange(team.id, e.target.value)}
                        className={cn(
                          "w-32",
                          !isValid && "border-red-500",
                          hasChanged && isValid && "border-orange-500"
                        )}
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-500">points</span>
                    </div>
                  </div>
                  {!isValid && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      Please enter a valid number (0 or greater)
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => handleAdjustTeamBudget(team.id)}
                  disabled={!hasChanged || !isValid || isSaving || isSaved}
                  size="sm"
                  className={cn(
                    isSaved && "bg-green-600 hover:bg-green-700"
                  )}
                >
                  {isSaved ? 'Saved' : 'Apply'}
                </Button>
              </div>
            )
          })}
        </div>

        {teams.length === 0 && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            No teams found
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
