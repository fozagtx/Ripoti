import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, Mic, Radio, Siren } from 'lucide-react'
import { api, fmtDate } from '../api'
import { usePolling } from '../hooks'

export function Overview() {
  const nav = useNavigate()
  const visits = usePolling(api.visits, 5000)
  const sync = usePolling(api.sync, 5000)
  const status = usePolling(api.status, 3000)
  const list = visits.data ?? []
  const today = list.filter((v) => new Date(v.createdAt).toDateString() === new Date().toDateString())
  const urgent = list.filter((v) => v.urgent)
  const connected = sync.data?.peers.filter((p) => p.connected).length ?? 0
  const loading = status.data?.models.filter((m) => m.status === 'loading') ?? []
  const failed = status.data?.models.filter((m) => m.status === 'error') ?? []

  return (
    <div className="stack">
      {(loading.length > 0 || failed.length > 0) && (
        <div className="notice">
          <div style={{ flex: 1 }}>
            <h2>{failed.length ? 'A model could not load' : 'Loading models on this device'}</h2>
            <p>{[...failed.map((m) => `${m.name}: ${m.error}`), ...loading.map((m) => `${m.name} ${m.progress}%`)].join(' · ')}</p>
          </div>
          <Link to="/device" className="btn outline">Details</Link>
        </div>
      )}
      <div className="hero">
        <div className="hero-card">
          <svg className="lines" viewBox="0 0 100 100" aria-hidden>
            {[18, 30, 42, 54, 66, 78].map((x, i) => <path key={x} d={`M${x} ${50 - (i % 3 + 1) * 10}v${(i % 3 + 1) * 20}`} stroke="#2f3600" strokeWidth="5" strokeLinecap="round" />)}
          </svg>
          <div>
            <h2>Speak the visit. Ripoti fills in the form.</h2>
            <p>Kiswahili or English. Transcription, the visit form and danger-sign checks all run on this device, with no signal needed.</p>
          </div>
          <div><Link to="/visit/new" className="btn dark big"><Mic size={18} /> Start a visit</Link></div>
        </div>
        <div className="card tint stack" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>Team sync</h2>
            <p className="sub" style={{ margin: 0 }}>
              {sync.data?.running ? `Running as ${sync.data.role} on team “${sync.data.team}”. ${connected} peer${connected === 1 ? '' : 's'} connected.` : 'Not syncing. Join the supervisor’s hotspot, then start sync.'}
            </p>
          </div>
          <div><Link to="/sync" className="btn outline"><Radio size={16} /> Open sync</Link></div>
        </div>
      </div>
      <div className="grid g4">
        <div className="card stat"><div className="k">Visits today</div><div className="v">{today.length}</div></div>
        <div className="card stat"><div className="k">All visits</div><div className="v">{list.length}</div></div>
        <div className={`card stat ${urgent.length ? 'alert' : ''}`}><div className="k">Need referral</div><div className="v">{urgent.length}</div></div>
        <div className="card stat"><div className="k">Peers connected</div><div className="v">{sync.data?.running ? connected : '—'}</div></div>
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2>Latest visits</h2>
          <Link to="/visits" className="btn"><ClipboardList size={16} /> All visits</Link>
        </div>
        {list.length === 0 ? (
          <div className="empty"><h3>No visits yet</h3><p>Record your first household visit to see it here.</p></div>
        ) : (
          <table className="table">
            <tbody>
              {list.slice(0, 5).map((v) => (
                <tr key={v.id} className="link" onClick={() => nav(`/visits/${v.id}`)}>
                  <td style={{ width: 170 }}><span className="hh">Household {v.form.householdId || '—'}</span></td>
                  <td className="muted">{v.form.summary}</td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>{v.urgent ? <span className="pill danger"><Siren size={13} /> Refer</span> : <span className="pill ok">No danger signs</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
