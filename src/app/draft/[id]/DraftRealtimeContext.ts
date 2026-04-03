import { createContext, useContext } from 'react'
import type { UseDraftRealtimeReturn } from '@/hooks/useDraftRealtime'

const DraftRealtimeContext = createContext<UseDraftRealtimeReturn | null>(null)

export { DraftRealtimeContext }

export function useDraftRealtimeContext(): UseDraftRealtimeReturn {
  const ctx = useContext(DraftRealtimeContext)
  if (!ctx) {
    throw new Error(
      'useDraftRealtimeContext must be used within DraftRealtimeContext.Provider'
    )
  }
  return ctx
}
