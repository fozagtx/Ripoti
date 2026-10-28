import { useEffect, useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { api, fmtDate, type Settings } from '../api'
import { usePolling } from '../hooks'

export function Sync() {
  const sync = usePolling(api.sync, 2000)
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.settings().then(setS).catch((e: Error) => setError(e.message)) }, [])
  if (!s) return <div className="muted">Loading…</div>
  const st = sync.data

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await api.saveSettings(s!)
      await fn()
      await sync.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="grid g2">
        <div className="card stack">
          <div>
            <h2>This device</h2>
            <p className="sub">Phones and the supervisor laptop join the same hotspot or Wi-Fi. No internet is needed.</p>
          </div>
          <div className="field"><label>Device name</label><input className="input" value={s.device} disabled={st?.running} onChange={(e) => setS({ ...s, device: e.target.value })} /></div>
          <div className="field"><label>Role</label>
            <select className="select" value={s.role} disabled={st?.running} onChange={(e) => setS({ ...s, role: e.target.value as Settings['role'] })}>
              <option value="promoter">Promoter (records visits)</option>
              <option value="supervisor">Supervisor (hosts sync, receives all visits)</option>
            </select>
          </div>
          <div className="field"><label>Team code</label><input className="input" placeholder="Same code on every device, e.g. kibera-unit-3" value={s.team} disabled={st?.running} onChange={(e) => setS({ ...s, team: e.target.value })} /></div>
          {s.role === 'promoter' && (
            <div className="field"><label>Supervisor address</label><input className="input" placeholder="Shown on the supervisor's sync page, e.g. 192.168.43.1:49737" value={s.supervisorAddress} disabled={st?.running} onChange={(e) => setS({ ...s, supervisorAddress: e.target.value })} /></div>
          )}
          <div className="row">
            {st?.running ? (
              <button className="btn" disabled={busy} onClick={() => run(api.stopSync)}><Square size={15} /> Stop sync</button>
            ) : (
              <button className="btn primary" disabled={busy || !s.team || (s.role === 'promoter' && !s.supervisorAddress)} onClick={() => run(api.startSync)}>
                {busy ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Start sync
              </button>
            )}
          </div>
          {(error || st?.error) && <div className="error">{error ?? st?.error}</div>}
        </div>
        <div className="card stack">
          <div>
            <h2>Status</h2>
            <p className="sub">{st?.running ? `Running as ${st.role} on team “${st.team}”` : 'Stopped'}</p>
          </div>
          {st?.running && st.role === 'supervisor' && (
            <div>
              <div className="small muted">Promoters enter this supervisor address</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{st.supervisorAddress}</div>
            </div>
          )}
          <div className="small muted">Local addresses: {st?.localAddresses.join(', ') || 'none — join a hotspot or Wi-Fi'}</div>
          <div><div className="small muted">This device's visit log key</div><div className="mono">{st?.ownKey}</div></div>
        </div>
      </div>
      <div className="card">
        <h2>Peers</h2>
        <p className="sub">Each device keeps its own signed, append-only visit log (Hypercore). Peers replicate each other's logs.</p>
        {!st?.peers.length ? (
          <div className="empty"><h3>No peers yet</h3><p>Start sync on the supervisor laptop first, then on each promoter phone.</p></div>
        ) : (
          <table className="table">
            <thead><tr><th>Device</th><th>Role</th><th>Status</th><th>Visits</th><th>Last seen</th></tr></thead>
            <tbody>
              {st.peers.map((p) => (
                <tr key={p.key}>
                  <td><b>{p.device}</b><div className="mono muted">{p.key.slice(0, 16)}…</div></td>
                  <td>{p.role}</td>
                  <td>{p.connected ? <span className="pill ok">Connected</span> : <span className="pill">Offline</span>}</td>
                  <td>{p.visits}</td>
                  <td className="small muted">{p.lastSeen ? fmtDate(p.lastSeen) : 'Via supervisor'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
