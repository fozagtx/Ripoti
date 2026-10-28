import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardList, Mic, Radio } from 'lucide-react'
import { api, fmtDate } from '../api'
import { usePolling } from '../hooks'

export function Overview() {
  const visits = usePolling(api.visits, 5000)
  const sync = usePolling(api.sync, 5000)
  const status = usePolling(api.status, 3000)
  const list = visits.data ?? []
  const today = list.filter((v) => new Date(v.createdAt).toDateString() === new Date().toDateString())
  const urgent = list.filter((v) => v.urgent)
  const connected = sync.data?.peers.filter((p) => p.connected).length ?? 0
  const notReady = status.data?.models.filter((m) => m.status !== 'ready') ?? []

  return (
    <div className="stack">
      {notReady.length > 0 && (
        <div className="card row between">
          <div>
            <h2>Models are {notReady.some((m) => m.status === 'error') ? 'not available' : 'warming up'}</h2>
            <p className="sub" style={{ margin: 0 }}>
              {notReady.map((m) => `${m.name}: ${m.status === 'loading' ? `${m.progress}%` : m.status}`).join(' · ')}
            </p>
          </div>
          <Link to="/device" className="btn">Details</Link>
        </div>
      )}
      <div className="grid g4">
        <div className="card stat"><div className="k">Visits today</div><div className="v">{today.length}</div></div>
        <div className="card stat"><div className="k">All visits</div><div className="v">{list.length}</div></div>
        <div className="card stat"><div className="k">Need referral</div><div className="v" style={{ color: urgent.length ? 'var(--danger)' : undefined }}>{urgent.length}</div></div>
        <div className="card stat"><div className="k">Peers connected</div><div className="v">{sync.data?.running ? connected : '—'}</div></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Start a visit</h2>
          <p className="sub">Speak in Swahili or English. Transcription, the form and danger-sign checks run on this device.</p>
          <Link to="/visit/new" className="btn primary big"><Mic size={18} /> New visit</Link>
        </div>
        <div className="card">
          <h2>Team sync</h2>
          <p className="sub">{sync.data?.running ? `Syncing with team “${sync.data.team}”` : 'Not syncing. Connect to the supervisor over the local hotspot.'}</p>
          <Link to="/sync" className="btn"><Radio size={16} /> Open sync</Link>
        </div>
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2>Latest visits</h2>
          <Link to="/visits" className="btn"><ClipboardList size={16} /> All visits</Link>
        </div>
        {list.length === 0 ? (
          <div className="empty"><h3>No visits yet</h3><p>Record your first household visit to see it here.</p></div>
        ) : (
          <table className="table">
            <tbody>
              {list.slice(0, 5).map((v) => (
                <tr key={v.id} className="link" onClick={() => (location.href = `/visits/${v.id}`)}>
                  <td><b>Household {v.form.householdId || '—'}</b><div className="small muted">{v.form.summary}</div></td>
                  <td className="small muted">{fmtDate(v.createdAt)}</td>
                  <td>{v.urgent ? <span className="pill danger"><AlertTriangle size={13} /> Refer</span> : <span className="pill ok">No danger signs</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
