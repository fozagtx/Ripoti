import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { usePolling } from '../hooks'
import { VisitEditor } from './VisitEditor'

export function VisitDetail() {
  const { id } = useParams()
  const fetcher = useCallback(() => api.visit(id!), [id])
  const { data, error } = usePolling(fetcher, 0)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>
  const own = !data.source || data.source === 'this device'
  return (
    <VisitEditor
      key={data.updatedAt}
      initial={data}
      readOnly={!own}
      onSaved={() => setSavedAt(new Date().toLocaleTimeString())}
      badges={<>
        {!own && <span className="pill brand">Synced from {data.source}, read-only</span>}
        {savedAt && <span className="pill ok">Saved {savedAt}</span>}
      </>}
    />
  )
}
