import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Trash2, Volume2 } from 'lucide-react'
import { api, fmtMs, type Member, type Visit } from '../api'

export function VisitEditor({ initial, onSaved, readOnly }: { initial: Visit; onSaved?: (v: Visit) => void; readOnly?: boolean }) {
  const [v, setV] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const f = v.form
  const setForm = (patch: Partial<typeof f>) => setV({ ...v, form: { ...f, ...patch } })
  const setMember = (i: number, patch: Partial<Member>) => setForm({ members: f.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const flagged = v.danger.filter((d) => d.flagged)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = await api.save(v)
      setV(saved)
      onSaved?.(saved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function readBack() {
    setSpeaking(true)
    setError(null)
    try {
      setAudioUrl(await api.readback(v.readback))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSpeaking(false)
    }
  }

  return (
    <div className="stack">
      {flagged.length ? (
        <div className="banner danger"><AlertTriangle size={20} /> Refer today: {flagged.map((d) => d.label).join(', ')}</div>
      ) : (
        <div className="banner ok"><CheckCircle2 size={20} /> No danger signs found in this note</div>
      )}
      <div className="grid g2">
        <div className="card stack">
          <div>
            <h2>Visit form</h2>
            <p className="sub">Filled in on this device. Check and correct before saving.</p>
          </div>
          <div className="grid g2">
            <div className="field"><label>Household number</label><input className="input" value={f.householdId} disabled={readOnly} onChange={(e) => setForm({ householdId: e.target.value })} /></div>
            <div className="field"><label>Vaccines up to date</label>
              <select className="select" disabled={readOnly} value={f.vaccinesUpToDate === null ? '' : String(f.vaccinesUpToDate)} onChange={(e) => setForm({ vaccinesUpToDate: e.target.value === '' ? null : e.target.value === 'true' })}>
                <option value="">Not mentioned</option><option value="true">Yes</option><option value="false">No</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>People seen</label>
            {f.members.map((m, i) => (
              <div className="member" key={i}>
                <select className="select" disabled={readOnly} value={m.role} onChange={(e) => setMember(i, { role: e.target.value })}>
                  {['mother', 'child', 'newborn', 'father', 'elder', 'other'].map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="input" disabled={readOnly} placeholder="Age (months)" value={m.ageMonths ?? ''} onChange={(e) => setMember(i, { ageMonths: e.target.value === '' ? null : Number(e.target.value) })} />
                <input className="input" disabled={readOnly} placeholder="Symptoms, comma separated" value={m.symptoms.join(', ')} onChange={(e) => setMember(i, { symptoms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                {!readOnly && <button className="btn" onClick={() => setForm({ members: f.members.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 size={15} /></button>}
              </div>
            ))}
            {!readOnly && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ members: [...f.members, { role: 'child', ageMonths: null, symptoms: [] }] })}><Plus size={15} /> Add person</button>}
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" disabled={readOnly} checked={f.pregnant} onChange={(e) => setForm({ pregnant: e.target.checked })} /> Pregnant</label>
            {f.pregnant && <input className="input" style={{ width: 160 }} disabled={readOnly} placeholder="Months pregnant" value={f.gestationMonths ?? ''} onChange={(e) => setForm({ gestationMonths: e.target.value === '' ? null : Number(e.target.value) })} />}
            <label className="check"><input type="checkbox" disabled={readOnly} checked={f.referralGiven} onChange={(e) => setForm({ referralGiven: e.target.checked })} /> Referral given</label>
          </div>
          <div className="field"><label>Follow-up</label><input className="input" disabled={readOnly} value={f.followUp} onChange={(e) => setForm({ followUp: e.target.value })} /></div>
          <div className="field"><label>Summary</label><textarea className="textarea" disabled={readOnly} value={f.summary} onChange={(e) => setForm({ summary: e.target.value })} /></div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Danger signs</h2>
            <p className="sub">Each sign needs a quote from the note. Untick or tick to correct.</p>
            <div className="stack" style={{ gap: 8 }}>
              {v.danger.map((d, i) => (
                <label key={d.id} className={`sign ${d.flagged ? 'on' : ''}`}>
                  <span style={{ flex: 1 }}>
                    <b style={{ fontWeight: 600 }}>{d.label}</b> <span className="small muted">· {d.labelSw}</span>
                    {d.evidence && <div className="small muted">“{d.evidence}”</div>}
                  </span>
                  <input type="checkbox" disabled={readOnly} checked={d.flagged} onChange={(e) => setV({ ...v, danger: v.danger.map((x, j) => (j === i ? { ...x, flagged: e.target.checked } : x)) })} />
                </label>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Transcript</h2>
            <p className="sub">{v.language === 'sw' ? 'Kiswahili' : 'English'} · {v.models.stt}</p>
            <div className="transcript">{v.transcript}</div>
          </div>
          <div className="card">
            <h2>Read-back</h2>
            <p className="sub">Spoken in Kiswahili on this device so the household hears the advice.</p>
            <div className="transcript" style={{ marginBottom: 12 }}>{v.readback}</div>
            <div className="row">
              <button className="btn" onClick={readBack} disabled={speaking}>{speaking ? <Loader2 size={16} className="spin" /> : <Volume2 size={16} />} {speaking ? 'Generating speech…' : 'Play read-back'}</button>
            </div>
            {audioUrl && <audio controls autoPlay src={audioUrl} style={{ width: '100%', marginTop: 12 }} />}
          </div>
          {v.timings.length > 0 && (
            <div className="card">
              <h2>Timings</h2>
              <p className="sub">{v.models.llm}</p>
              <div className="row">{v.timings.map((t) => <span key={t.stage} className="pill">{t.stage} {fmtMs(t.ms)}</span>)}</div>
            </div>
          )}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!readOnly && (
        <div className="row">
          <button className="btn primary big" onClick={save} disabled={saving}>{saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />} Save visit</button>
        </div>
      )}
    </div>
  )
}
