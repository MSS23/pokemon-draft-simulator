'use client'

import { useState, useCallback } from 'react'

export interface PendingAction {
  id: string
  type: 'pick' | 'bid' | 'nominate'
  pokemonId?: string
  status: 'pending' | 'success' | 'failed'
  timestamp: number
}

export function useOptimisticUpdates() {
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])

  const addPendingAction = useCallback((type: string, pokemonId?: string) => {
    const action: PendingAction = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type as 'pick' | 'bid' | 'nominate',
      pokemonId,
      status: 'pending',
      timestamp: Date.now()
    }
    setPendingActions(prev => [...prev, action])
    return action.id
  }, [])

  const confirmAction = useCallback((actionId: string) => {
    setPendingActions(prev =>
      prev.map(action =>
        action.id === actionId ? { ...action, status: 'success' as const } : action
      )
    )
    // Remove successful actions after a delay
    setTimeout(() => {
      setPendingActions(prev => prev.filter(action => action.id !== actionId))
    }, 2000)
  }, [])

  const failAction = useCallback((actionId: string) => {
    setPendingActions(prev =>
      prev.map(action =>
        action.id === actionId ? { ...action, status: 'failed' as const } : action
      )
    )
    // Remove failed actions after a delay
    setTimeout(() => {
      setPendingActions(prev => prev.filter(action => action.id !== actionId))
    }, 5000)
  }, [])

  const isActionPending = useCallback((type: string, pokemonId?: string) => {
    return pendingActions.some(action =>
      action.type === type &&
      action.status === 'pending' &&
      (!pokemonId || action.pokemonId === pokemonId)
    )
  }, [pendingActions])

  return {
    pendingActions,
    addPendingAction,
    confirmAction,
    failAction,
    isActionPending
  }
}

export function usePendingActionFeedback(pokemonId?: string) {
  const { pendingActions } = useOptimisticUpdates()

  // Function to get pending action status for a specific type and pokemon
  const getPendingActionStatus = useCallback((type: string, targetPokemonId?: string) => {
    const id = targetPokemonId || pokemonId
    if (!id) return null

    return pendingActions.find(action =>
      action.type === type &&
      action.pokemonId === id &&
      (action.status === 'pending' || action.status === 'failed')
    )
  }, [pendingActions, pokemonId])

  return {
    getPendingActionStatus,
    pendingActions
  }
}