import { useEffect, useRef } from 'react'

/**
 * Calls refreshFn once on mount, then in the background at an interval.
 * refreshFn receives { background: boolean }.
 */
export default function useAutoRefresh(refreshFn, options = {}) {
  const {
    intervalMs = 5000,
    enabled = true,
    refreshOnVisible = true,
  } = options

  const refreshRef = useRef(refreshFn)

  useEffect(() => {
    refreshRef.current = refreshFn
  }, [refreshFn])

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false
    const safeIntervalMs = Math.max(Number(intervalMs) || 0, 1000)

    const runRefresh = async (background) => {
      if (cancelled) return
      try {
        await refreshRef.current?.({ background: !!background })
      } catch {
        // Page-specific load handlers already surface errors.
      }
    }

    runRefresh(false)

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      runRefresh(true)
    }, safeIntervalMs)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh(true)
      }
    }

    if (refreshOnVisible) {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      cancelled = true
      window.clearInterval(timer)
      if (refreshOnVisible) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [enabled, intervalMs, refreshOnVisible])
}
