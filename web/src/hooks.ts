import { useCallback, useEffect, useState } from 'react'

export function usePolling<T>(fn: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => fn().then((d) => { setData(d); setError(null) }).catch((e: Error) => setError(e.message)), [fn])
  useEffect(() => {
    refresh()
    if (!ms) return
    const t = setInterval(refresh, ms)
    return () => clearInterval(t)
  }, [refresh, ms])
  return { data, error, refresh }
}
