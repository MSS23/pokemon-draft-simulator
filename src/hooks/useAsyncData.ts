import { useState, useEffect, useCallback, useRef, DependencyList } from 'react'

interface UseAsyncDataOptions {
  /** Skip the fetch (e.g. while auth is still loading). Defaults to false. */
  skip?: boolean
}

interface UseAsyncDataResult<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  /** Manually re-trigger the fetch */
  refetch: () => void
}

/**
 * Generic hook that wraps the `useState(loading) + useState(error) + useEffect fetch` pattern.
 *
 * @param fetchFn  Async function that returns the data. Throw to set `error`.
 * @param deps     Dependency list – the fetch re-runs when any dep changes.
 * @param options  Optional config (e.g. `skip` to defer until ready).
 *
 * @example
 * ```ts
 * const { data: drafts, isLoading, error } = useAsyncData(
 *   () => DraftService.getMyDrafts(user.id),
 *   [user.id],
 *   { skip: !user }
 * )
 * ```
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: DependencyList,
  options: UseAsyncDataOptions = {},
): UseAsyncDataResult<T> {
  const { skip = false } = options

  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(!skip)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const execute = useCallback(async () => {
    if (skip) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchFn()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...deps])

  useEffect(() => {
    mountedRef.current = true
    execute()
    return () => {
      mountedRef.current = false
    }
  }, [execute])

  return { data, isLoading, error, refetch: execute }
}
