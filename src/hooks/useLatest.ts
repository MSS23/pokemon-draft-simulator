import { useRef, useEffect } from 'react'

/**
 * useLatest Hook
 *
 * Returns a ref that always contains the latest value.
 * Useful for accessing current state/props in callbacks without recreating them.
 *
 * Solves the "stale closure" problem where callbacks capture old values.
 *
 * @example
 * const latestCallback = useLatest(callback)
 * // In async function:
 * latestCallback.current() // Always gets the latest callback
 */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef<T>(value)

  useEffect(() => {
    ref.current = value
  })

  return ref
}
