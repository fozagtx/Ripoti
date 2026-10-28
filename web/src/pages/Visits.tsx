import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Siren } from 'lucide-react'
import { api, fmtDate, type Visit } from '../api'
import { usePolling } from '../hooks'

export function VisitTable({ visits, empty }: { visits: Visit[]; empty: React.ReactNode }) {
  const nav = useNavigate()
  if (!visits.length) return <>{empty}</>
  return (
    <table className="table">
      <thead>
        <tr><th>Household</th><th>Summary</th><th>Danger signs</th><th>Recorded on</th><th>When</th></tr>
      </thead>
      <tbody>
        {visits.map((v) => (
          <tr key={v.id} className="link" onClick={() => nav(`/visits/${v.id}`)}>
            <td><span className="hh">{v.form.householdId || '—'}</span></td>
            <td className="muted" style={{ maxWidth: 400 }}>{v.form.summary}</td>
            <td>
              {v.urgent ? (
                <span className="pill danger"><Siren size={13} /> {v.danger.filter((d) => d.flagged).map((d) => d.label).join(', ')}</span>
              ) : (
                <span className="pill ok">None</span>
              )}
            </td>
            <td className="small">{v.source ?? v.device}</td>
            <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Visits() {
  const { data, error } = usePolling(api.visits, 5000)
  const [q, setQ] = useState('')
  const list = (data ?? []).filter((v) => !q || v.form.householdId.includes(q) || v.form.summary.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Search household or summary" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="small muted">{data ? `${list.length} of ${data.length}` : ''}</span>
      </div>
      {error && <div className="error">{error}</div>}
      <VisitTable visits={list} empty={<div className="empty"><h3>{q ? 'No matches' : 'No visits yet'}</h3><p>{q ? 'Try another household number.' : 'Saved and synced visits appear here.'}</p></div>} />
    </div>
  )
}
