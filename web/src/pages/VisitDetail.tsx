import { useParams } from 'react-router-dom'
import { api } from '../api'
import { usePolling } from '../hooks'
import { VisitEditor } from './VisitEditor'
import { useCallback, useState } from 'react'

export function VisitDetail() {
  const { id } = useParams()
  const fetcher = useCallback(() => api.visit(id!), [id])
  const { data, error } = usePolling(fetcher, 0)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>
  const own = !data.source || data.source === 'this device'
  return (
    <div className="stack">
      <div className="row small muted">
        Recorded on {data.device} · {new Date(data.createdAt).toLocaleString()}
        {!own && <span className="pill brand">Synced, read-only</span>}
        {savedAt && <span className="pill ok">Saved {savedAt}</span>}
      </div>
      <VisitEditor key={data.updatedAt} initial={data} readOnly={!own} onSaved={() => setSavedAt(new Date().toLocaleTimeString())} />
    </div>
  )
}
