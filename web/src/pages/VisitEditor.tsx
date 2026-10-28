import { useState, type ReactNode } from 'react'
import { CalendarDays, CheckCircle2, Languages, Loader2, Plus, Save, Siren, Smartphone, Trash2, Users, Volume2 } from 'lucide-react'
import { api, fmtDate, fmtMs, type Member, type Visit } from '../api'
import { readbackText } from '../../../server/readback.ts'

function SymptomsInput({ value, disabled, onChange }: { value: string[]; disabled?: boolean; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '))
  return <input className="input" disabled={disabled} placeholder="Symptoms, comma separated" value={text} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) }} />
}

export function VisitEditor({ initial, onSaved, readOnly, badges }: { initial: Visit; onSaved?: (v: Visit) => void; readOnly?: boolean; badges?: ReactNode }) {
  const [v, setV] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const f = v.form
  const setForm = (patch: Partial<typeof f>) => setV({ ...v, form: { ...f, ...patch } })
  const setMember = (i: number, patch: Partial<Member>) => setForm({ members: f.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const flagged = v.danger.filter((d) => d.flagged)
  const spoken = readbackText(f, v.danger)

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
      setAudioUrl(await api.readback(spoken))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSpeaking(false)
    }
  }

  return (
    <div className="stack">
      <div className="note-head">
        <h2>Household {f.householdId || '—'}</h2>
        <div className="row">
          <span className="chip"><CalendarDays size={14} /> {fmtDate(v.createdAt)}</span>
          <span className="chip"><Users size={14} /> {f.members.length} {f.members.length === 1 ? 'person' : 'people'}</span>
          <span className="chip"><Languages size={14} /> {v.language === 'sw' ? 'Kiswahili' : 'English'}</span>
          <span className="chip"><Smartphone size={14} /> {v.source && v.source !== 'this device' ? v.source : v.device}</span>
          {badges}
        </div>
      </div>
      {flagged.length ? (
        <div className="banner danger"><Siren size={22} /><span><span className="t">Refer today</span> &nbsp;{flagged.map((d) => d.label).join(', ')}</span></div>
      ) : (
        <div className="banner ok"><CheckCircle2 size={20} /> No danger signs found in this note</div>
      )}
      <div className="split">
        <div className="card stack">
          <div>
            <h2>Visit form</h2>
            <p className="sub" style={{ margin: 0 }}>Filled in on this device. Check and correct before saving.</p>
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
            {f.members.length === 0 && <div className="small muted">No one was named in the note.</div>}
            {f.members.map((m, i) => (
              <div className="member" key={i}>
                <select className="select" disabled={readOnly} value={m.role} onChange={(e) => setMember(i, { role: e.target.value })}>
                  {['mother', 'child', 'newborn', 'father', 'elder', 'other'].map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="input" disabled={readOnly} placeholder="Age (months)" value={m.ageMonths ?? ''} onChange={(e) => setMember(i, { ageMonths: e.target.value === '' ? null : Number(e.target.value) })} />
                <SymptomsInput disabled={readOnly} value={m.symptoms} onChange={(symptoms) => setMember(i, { symptoms })} />
                {!readOnly && <button className="btn icon-btn" onClick={() => setForm({ members: f.members.filter((_, j) => j !== i) })} aria-label="Remove person"><Trash2 size={15} /></button>}
              </div>
            ))}
            {!readOnly && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ members: [...f.members, { role: 'child', ageMonths: null, symptoms: [] }] })}><Plus size={15} /> Add person</button>}
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" disabled={readOnly} checked={f.pregnant} onChange={(e) => setForm({ pregnant: e.target.checked })} /> Pregnant</label>
            {f.pregnant && <input className="input" style={{ width: 170 }} disabled={readOnly} placeholder="Months pregnant" value={f.gestationMonths ?? ''} onChange={(e) => setForm({ gestationMonths: e.target.value === '' ? null : Number(e.target.value) })} />}
            <label className="check"><input type="checkbox" disabled={readOnly} checked={f.referralGiven} onChange={(e) => setForm({ referralGiven: e.target.checked })} /> Referral given</label>
          </div>
          <div className="field"><label>Follow-up</label><input className="input" disabled={readOnly} placeholder="Not stated in the note" value={f.followUp} onChange={(e) => setForm({ followUp: e.target.value })} /></div>
          <div className="field"><label>Summary</label><textarea className="textarea" disabled={readOnly} value={f.summary} onChange={(e) => setForm({ summary: e.target.value })} /></div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Danger signs</h2>
            <p className="sub">A sign is only ticked when the note says it. Tick or untick to correct.</p>
            <div className="stack" style={{ gap: 8 }}>
              {v.danger.map((d, i) => (
                <label key={d.id} className={`sign ${d.flagged ? 'on' : ''}`}>
                  <span style={{ flex: 1 }}>
                    <b style={{ fontWeight: 600 }}>{d.label}</b> <span className="small muted">· {d.labelSw}</span>
                    {d.evidence && <div className="quote">“{d.evidence}”</div>}
                  </span>
                  <input type="checkbox" disabled={readOnly} checked={d.flagged} onChange={(e) => setV({ ...v, danger: v.danger.map((x, j) => (j === i ? { ...x, flagged: e.target.checked } : x)) })} />
                </label>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Transcript</h2>
            <p className="sub">{v.models.stt}</p>
            <div className="transcript">{v.transcript}</div>
          </div>
          <div className="card">
            <h2>Read-back</h2>
            <p className="sub">Spoken in Kiswahili on this device so the household hears the advice.</p>
            <div className="transcript" style={{ marginBottom: 14 }}>{spoken}</div>
            <button className="btn outline" onClick={readBack} disabled={speaking}>{speaking ? <Loader2 size={16} className="spin" /> : <Volume2 size={16} />} {speaking ? 'Generating speech on this device…' : 'Play read-back'}</button>
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
        <div className="savebar">
          <span className="small">Check the form and danger signs, then save.</span>
          <button className="btn lime big" onClick={save} disabled={saving}>{saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />} Save visit</button>
        </div>
      )}
    </div>
  )
}
