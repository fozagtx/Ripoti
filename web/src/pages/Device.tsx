import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { api, fmtBytes, fmtMs } from '../api'
import { usePolling } from '../hooks'

const ROLE: Record<string, string> = { stt: 'Speech to text', llm: 'Form filling and danger signs', tts: 'Kiswahili read-back' }

export function Device() {
  const { data, error } = usePolling(api.status, 2000)
  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>
  const sys = data.system
  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <div>
            <h2>Local models (QVAC)</h2>
            <p className="sub">Downloaded once, then run with the network off.</p>
          </div>
          <button className="btn" onClick={() => api.warm()}>Load all models</button>
        </div>
        <table className="table">
          <thead><tr><th>Job</th><th>Model</th><th>Status</th><th>Load time</th></tr></thead>
          <tbody>
            {data.models.map((m) => (
              <tr key={m.role}>
                <td>{ROLE[m.role] ?? m.role}</td>
                <td><b>{m.name}</b></td>
                <td>
                  {m.status === 'ready' && <span className="pill ok"><CheckCircle2 size={13} /> Ready</span>}
                  {m.status === 'idle' && <span className="pill"><CircleDashed size={13} /> Loads on first use</span>}
                  {m.status === 'loading' && (
                    <div style={{ minWidth: 160 }}>
                      <span className="pill brand"><Loader2 size={13} className="spin" /> Loading {m.progress}%</span>
                      <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${m.progress}%` }} /></div>
                    </div>
                  )}
                  {m.status === 'error' && <span className="pill danger" title={m.error ?? ''}><XCircle size={13} /> {m.error}</span>}
                </td>
                <td className="small muted">{m.loadMs ? fmtMs(m.loadMs) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid g4">
        <div className="card stat"><div className="k">System</div><div className="v" style={{ fontSize: 18 }}>{sys.platform} {sys.release.split('-')[0]}</div></div>
        <div className="card stat"><div className="k">CPU threads</div><div className="v">{sys.cpus}</div></div>
        <div className="card stat"><div className="k">Memory free / total</div><div className="v" style={{ fontSize: 20 }}>{fmtBytes(sys.freeMem)} / {fmtBytes(sys.totalMem)}</div></div>
        <div className="card stat"><div className="k">Ripoti server memory</div><div className="v" style={{ fontSize: 20 }}>{fmtBytes(sys.rss)}</div></div>
      </div>
      <div className="card">
        <h2>Danger-sign checklist</h2>
        <p className="sub">From WHO/UNICEF iCCM and WHO antenatal care guidance. Only signs that fit the people in the visit are checked.</p>
        <table className="table">
          <thead><tr><th>Group</th><th>Sign</th><th>Kiswahili</th></tr></thead>
          <tbody>{data.dangerSigns.map((d) => <tr key={d.id}><td className="small muted">{d.group}</td><td>{d.label}</td><td className="muted">{d.labelSw}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
