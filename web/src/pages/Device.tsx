import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { api, fmtBytes, fmtMs, type Status } from '../api'
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
          <button className="btn outline" onClick={() => api.warm()}>{data.memoryMode === 'lean' ? 'Download all models' : 'Load all models'}</button>
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
                  {m.status === 'idle' && <span className="pill"><CircleDashed size={13} /> {data.memoryMode === 'lean' ? 'Loads when needed' : 'Loads on first use'}</span>}
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
      <FitCard data={data} />
      <div className="grid g4">
        <div className="card stat"><div className="k">System</div><div className="v small-v">{sys.platform} {sys.release.split('-')[0]}</div></div>
        <div className="card stat"><div className="k">CPU threads</div><div className="v">{sys.cpus}</div></div>
        <div className="card stat"><div className="k">Memory free / total</div><div className="v small-v">{fmtBytes(sys.freeMem)} / {fmtBytes(sys.totalMem)}</div></div>
        <div className="card stat"><div className="k">QVAC worker memory now</div><div className="v small-v">{sys.qvacRss === null ? '—' : fmtBytes(sys.qvacRss)}</div></div>
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

const VERDICT: Record<string, { label: string; cls: string }> = {
  'likely-fits': { label: 'Likely fits', cls: 'ok' },
  'likely-too-large': { label: 'Likely too large', cls: 'danger' },
  unknown: { label: "QVAC can't say yet", cls: '' },
  error: { label: 'Check failed', cls: 'danger' },
}

function FitCard({ data }: { data: Status }) {
  const f = data.fit
  const v = VERDICT[f.verdict] ?? VERDICT.unknown
  const floor = f.models.reduce((m, x) => (f.execution === 'sequential' ? Math.max(m, x.floorBytes ?? 0) : m + (x.floorBytes ?? 0)), 0)
  return (
    <div className="card">
      <div className="row between">
        <div>
          <h2>Will it run on this laptop?</h2>
          <p className="sub">
            {data.memoryMode === 'lean'
              ? 'One model in memory at a time: speech, then form filling, then read-back. Used on laptops under 24 GB.'
              : 'All models stay loaded for speed. Set RIPOTI_MEMORY=lean to keep one at a time.'}
          </p>
        </div>
        <span className={`pill ${v.cls}`}>{v.label}</span>
      </div>
      <div className="grid g4" style={{ marginTop: 12 }}>
        <div className="stat"><div className="k">Memory mode</div><div className="v small-v">{data.memoryMode === 'lean' ? 'One at a time' : 'All loaded'}</div></div>
        <div className="stat"><div className="k">Laptop RAM</div><div className="v small-v">{f.totalBytes ? fmtBytes(f.totalBytes) : '—'}</div></div>
        <div className="stat"><div className="k">Budget after reserve</div><div className="v small-v">{f.budgetBytes ? fmtBytes(f.budgetBytes) : '—'}</div></div>
        <div className="stat"><div className="k">Models need at least</div><div className="v small-v">{floor ? fmtBytes(floor) : '—'}</div></div>
      </div>
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        From QVAC getSystemResources and assessModelFit ({f.execution}, {f.cpu ?? 'CPU'}, {f.cores ?? '?'} threads, {f.gpus ? `${f.gpus} GPU` : 'no GPU'}).
        {f.verdict === 'unknown' && ' QVAC computed a minimum but has not measured runtime overhead, so it cannot confirm a fit.'}
        {f.error && ` ${f.error}`}
      </p>
    </div>
  )
}
