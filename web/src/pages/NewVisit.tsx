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

// Captures the microphone as 16 kHz mono float32, the format QVAC's
// live Whisper session reads.
const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true }
}
registerProcessor('tap', Tap)`

function resample(input: Float32Array, from: number): Float32Array {
  if (from === 16000) return input
  const ratio = from / 16000
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)]
  return out
}

interface LiveRefs {
  id: string
  stream: MediaStream
  ctx: AudioContext
  events: EventSource
  buf: Float32Array[]
  timer: number
  sending: Promise<unknown>
}

export function NewVisit() {
  const [language, setLanguage] = useState<'sw' | 'en'>('sw')
  const [recording, setRecording] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [phrases, setPhrases] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [live, setLive] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<LiveRefs | null>(null)
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

  useEffect(() => () => teardown(), [])

  function teardown() {
    const r = refs.current
    if (!r) return
    clearInterval(r.timer)
    r.stream.getTracks().forEach((t) => t.stop())
    r.ctx.close().catch(() => {})
    r.events.close()
  }

  function flush() {
    const r = refs.current
    if (!r || !r.buf.length) return
    const n = r.buf.reduce((s, b) => s + b.length, 0)
    const pcm = new Float32Array(n)
    let o = 0
    for (const b of r.buf.splice(0)) {
      pcm.set(b, o)
      o += b.length
    }
    const id = r.id
    r.sending = r.sending.then(() => api.liveAudio(id, pcm)).catch((e: Error) => setError(e.message))
  }

  async function start() {
    setError(null)
    setPhrases([])
    setReady(false)
    setJob(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      setError(`Microphone unavailable: ${(e as Error).message}. You can upload a recording instead.`)
      return
    }
    try {
      const { id } = await api.liveStart(language)
      const ctx = new AudioContext({ sampleRate: 16000 })
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
      const tap = new AudioWorkletNode(ctx, 'tap')
      ctx.createMediaStreamSource(stream).connect(tap)
      const events = new EventSource(`/api/live/${id}/events`)
      events.onmessage = (m) => {
        const e = JSON.parse(m.data) as { type: string; text?: string; speaking?: boolean }
        if (e.type === 'ready') setReady(true)
        else if (e.type === 'text' && e.text) setPhrases((p) => [...p, e.text!])
        else if (e.type === 'vad') setSpeaking(!!e.speaking)
      }
      const r: LiveRefs = { id, stream, ctx, events, buf: [], timer: 0, sending: Promise.resolve() }
      tap.port.onmessage = (m) => r.buf.push(resample(m.data as Float32Array, ctx.sampleRate))
      r.timer = window.setInterval(flush, 250)
      refs.current = r
      setSeconds(0)
      setLive(true)
      setRecording(true)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      setError((e as Error).message)
    }
  }

  async function stop() {
    const r = refs.current
    if (!r) return
    setRecording(false)
    setFinishing(true)
    clearInterval(r.timer)
    r.stream.getTracks().forEach((t) => t.stop())
    flush()
    await r.sending
    try {
      const { jobId } = await api.liveStop(r.id)
      setJob(await api.job(jobId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      teardown()
      refs.current = null
      setFinishing(false)
      setSpeaking(false)
    }
  }

  async function submit(blob: Blob) {
    setError(null)
    setLive(false)
    setPhrases([])
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
  const status = finishing
    ? 'Finishing the last phrase…'
    : recording
      ? !ready
        ? 'Loading the speech model… you can start talking'
        : speaking
          ? 'Hearing speech…'
          : 'Listening… tap to stop'
      : 'Tap and speak. Text appears as you pause.'

  return (
    <div className="split">
      <div className="card">
        <div className="row between">
          <h2>Record the visit</h2>
          <div className="lang" role="group" aria-label="Language spoken">
            {(['sw', 'en'] as const).map((l) => (
              <button key={l} className={language === l ? 'on' : ''} disabled={!!busy || recording || finishing} onClick={() => setLanguage(l)}>{l === 'sw' ? 'Kiswahili' : 'English'}</button>
            ))}
          </div>
        </div>
        <div className="recorder">
          <button className={`mic ${recording ? 'rec' : ''}`} onClick={recording ? stop : start} disabled={!!busy || finishing} aria-label={recording ? 'Stop recording' : 'Start recording'}>
            {recording ? <Square size={34} /> : <Mic size={40} />}
          </button>
          <div className="row" style={{ gap: 12 }}>
            <div className={`bars ${recording && (speaking || !ready) ? 'on' : ''}`}><i /><i /><i /><i /><i /></div>
            <div className="timer">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div>
          </div>
          <div className="muted small">{status}</div>
          {(recording || finishing || (live && phrases.length > 0)) && (
            <div className="live-transcript" aria-live="polite">
              <div className="section-label">Live transcript (whisper-small){ready && recording && <span className={`live-dot ${speaking ? 'on' : ''}`} />}</div>
              {phrases.length === 0 ? <p className="muted small">Each phrase appears here when you pause.</p> : <p>{phrases.join(' ')}</p>}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center' }}>
            <label className="btn outline" style={{ opacity: busy ? 0.45 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              <Upload size={16} /> Upload audio
              <input type="file" accept="audio/*" hidden disabled={!!busy} onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="section-label" style={{ justifyContent: 'center', marginTop: 8 }}>Say</div>
        <div className="prompts">
          {['Household number', 'Who you saw', 'Ages', 'Symptoms and how long', 'Pregnancy', 'Vaccines', 'Advice and follow-up'].map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
        {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}
      </div>
      <div className="card tint">
        <h2>On-device processing</h2>
        <p className="sub">No audio or text leaves this device.</p>
        <div className="steps">
          {STAGES.map((s, i) => {
            const isDone = done.has(s.id)
            const active = !!job && job.stage === s.id && !isDone
            const ms = job?.stages.find((x) => x.stage === s.id && x.status === 'done')?.at
            const st = job?.stages.find((x) => x.stage === s.id && x.status === 'start')?.at
            return (
              <div key={s.id} className={`step ${isDone ? 'done' : active ? 'active' : ''}`}>
                <span className="dot">{isDone ? <Check size={14} /> : active ? <Loader2 size={14} className="spin" /> : i + 1}</span>
                <span style={{ flex: 1 }}>{s.label}</span>
                {isDone && ms && st && <span className="small muted">{fmtMs(ms - st)}</span>}
              </div>
            )
          })}
        </div>
        {!job && <p className="small muted" style={{ margin: '14px 0 0' }}>Record or upload a visit to start. Expect one to three minutes on a laptop CPU.</p>}
        {job?.transcript && live && <div className="section-label" style={{ marginTop: 14 }}>Final transcript (whisper-large-v3-turbo)</div>}
        {job?.transcript && <div className="transcript" style={{ marginTop: 14 }}>{job.transcript}</div>}
        {job?.error && <div className="error" style={{ marginTop: 14 }}>{job.error}</div>}
        {job?.stage === 'error' && <button className="btn" style={{ marginTop: 12 }} onClick={() => setJob(null)}>Try again</button>}
      </div>
    </div>
  )
}
