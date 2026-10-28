import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Mic, Square, Upload } from 'lucide-react'
import { api, fmtMs, type Job } from '../api'
import { VisitEditor } from './VisitEditor'

const STAGES = [
  { id: 'normalise', label: 'Cleaning up the audio' },
  { id: 'transcribe', label: 'Transcribing speech (Whisper)' },
  { id: 'extract', label: 'Filling in the visit form' },
  { id: 'danger', label: 'Checking danger signs' },
]

export function NewVisit() {
  const [language, setLanguage] = useState<'sw' | 'en'>('sw')
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const nav = useNavigate()

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  useEffect(() => {
    if (!job || job.stage === 'done' || job.stage === 'error') return
    const t = setInterval(() => api.job(job.id).then(setJob).catch((e: Error) => setError(e.message)), 700)
    return () => clearInterval(t)
  }, [job])

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      chunks.current = []
      r.ondataavailable = (e) => chunks.current.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setAudio(new Blob(chunks.current, { type: r.mimeType }))
      }
      r.start()
      rec.current = r
      setSeconds(0)
      setAudio(null)
      setRecording(true)
    } catch (e) {
      setError(`Microphone unavailable: ${(e as Error).message}. You can upload a recording instead.`)
    }
  }

  function stop() {
    rec.current?.stop()
    setRecording(false)
  }

  async function submit(blob: Blob) {
    setError(null)
    const fd = new FormData()
    fd.append('audio', blob, 'visit')
    fd.append('language', language)
    try {
      const { jobId } = await api.process(fd)
      setJob(await api.job(jobId))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (job?.stage === 'done' && job.visit) {
    return <VisitEditor initial={job.visit} onSaved={(v) => nav(`/visits/${v.id}`)} />
  }

  const busy = job && job.stage !== 'error'
  const done = new Set(job?.stages.filter((s) => s.status === 'done').map((s) => s.stage))

  return (
    <div className="grid g2">
      <div className="card">
        <div className="row between">
          <h2>Record the visit</h2>
          <select className="select" style={{ width: 'auto' }} value={language} onChange={(e) => setLanguage(e.target.value as 'sw' | 'en')} disabled={!!busy || recording}>
            <option value="sw">Kiswahili</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className="sub">Say the household number, who you saw, their age, symptoms, pregnancy and vaccines, and what you advised.</p>
        <div className="recorder">
          <button className={`mic ${recording ? 'rec' : ''}`} onClick={recording ? stop : start} disabled={!!busy} aria-label={recording ? 'Stop recording' : 'Start recording'}>
            {recording ? <Square size={34} /> : <Mic size={38} />}
          </button>
          <div className="timer">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div>
          <div className="muted small">{recording ? 'Recording… tap to stop' : audio ? 'Recording ready' : 'Tap to start recording'}</div>
          {audio && !recording && <audio controls src={URL.createObjectURL(audio)} style={{ width: '100%' }} />}
          <div className="row">
            <button className="btn primary" disabled={!audio || !!busy} onClick={() => audio && submit(audio)}>
              <Check size={16} /> Process visit
            </button>
            <label className="btn" style={{ opacity: busy ? 0.5 : 1 }}>
              <Upload size={16} /> Upload audio
              <input type="file" accept="audio/*" hidden disabled={!!busy} onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
            </label>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <h2>On-device processing</h2>
        <p className="sub">No audio or text leaves this device.</p>
        {!job ? (
          <div className="empty" style={{ padding: 24 }}><p>Steps will appear here once you process a recording.</p></div>
        ) : (
          <div className="stack">
            <div className="steps">
              {STAGES.map((s) => {
                const isDone = done.has(s.id)
                const active = job.stage === s.id && !isDone
                const ms = job.stages.find((x) => x.stage === s.id && x.status === 'done')?.at
                const st = job.stages.find((x) => x.stage === s.id && x.status === 'start')?.at
                return (
                  <div key={s.id} className={`step ${isDone ? 'done' : active ? 'active' : ''}`}>
                    <span className="dot">{isDone ? <Check size={15} /> : active ? <Loader2 size={15} className="spin" /> : null}</span>
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {isDone && ms && st && <span className="small muted">{fmtMs(ms - st)}</span>}
                  </div>
                )
              })}
            </div>
            {job.transcript && <div className="transcript">{job.transcript}</div>}
            {job.error && <div className="error">{job.error}</div>}
            {job.stage === 'error' && <button className="btn" onClick={() => setJob(null)}>Try again</button>}
          </div>
        )}
      </div>
    </div>
  )
}
