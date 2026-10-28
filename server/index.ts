import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { hostname, totalmem, freemem, cpus, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { Ledger, type Role } from './ledger.ts'
import { processVisit, type Stage } from './pipeline.ts'
import { streamSSE } from 'hono/streaming'
import { liveTranscribe, memoryMode, modelStates, prefetch, readbackText, shutdown, speak, warm, normaliseForm, type LiveEvent } from './qvac.ts'
import { pcmToWav } from './audio.ts'
import { fitCheck, qvacMemory } from './device.ts'
import { DANGER_SIGNS } from './protocol.ts'
import type { Visit } from './types.ts'

const PORT = Number(process.env.PORT ?? 4747)
const DATA = resolve(process.env.RIPOTI_DATA ?? 'data')
const SETTINGS_FILE = join(DATA, 'settings.json')

interface Settings {
  device: string
  role: Role
  team: string
  supervisorAddress: string
}

await mkdir(join(DATA, 'audio'), { recursive: true })
const settings: Settings = {
  device: hostname(),
  role: 'promoter',
  team: '',
  supervisorAddress: '',
  ...(existsSync(SETTINGS_FILE) ? JSON.parse(await readFile(SETTINGS_FILE, 'utf8')) : {}),
}
const saveSettings = () => writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2))

const ledger = new Ledger(join(DATA, 'corestore'), settings.role, settings.device)
await ledger.ready()

interface Job {
  id: string
  stage: Stage | 'queued' | 'done' | 'error'
  stages: { stage: Stage; status: 'start' | 'done'; at: number }[]
  transcript: string | null
  visit: Visit | null
  error: string | null
}
const jobs = new Map<string, Job>()

const app = new Hono()

app.get('/api/status', async (c) =>
  c.json({
    device: settings.device,
    role: settings.role,
    models: modelStates(),
    memoryMode,
    fit: await fitCheck(),
    system: { platform: platform(), release: release(), cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMem: totalmem(), freeMem: freemem(), rss: process.memoryUsage().rss, qvacRss: qvacMemory() },
    dangerSigns: DANGER_SIGNS,
  }),
)

app.post('/api/models/warm', (c) => {
  if (memoryMode === 'full') warm()
  else prefetch().catch((e: Error) => console.error('model download failed:', e.message))
  return c.json({ ok: true, memoryMode })
})

function startJob(input: { audio?: Buffer; transcript?: string; language: 'sw' | 'en' }, keep?: { audio: Buffer; ext: string }) {
  const job: Job = { id: randomUUID(), stage: 'queued', stages: [], transcript: input.transcript ?? null, visit: null, error: null }
  jobs.set(job.id, job)
  processVisit({ ...input, device: settings.device }, (stage, status, detail) => {
    job.stage = stage
    job.stages.push({ stage, status, at: Date.now() })
    if (stage === 'transcribe' && status === 'done') job.transcript = String(detail)
  })
    .then(async (visit) => {
      if (keep) await writeFile(join(DATA, 'audio', `${visit.id}.${keep.ext}`), keep.audio)
      job.visit = visit
      job.transcript = visit.transcript
      job.stage = 'done'
    })
    .catch((e: Error) => {
      job.error = e.message
      job.stage = 'error'
    })
  return job
}

app.post('/api/visits/process', async (c) => {
  const body = await c.req.parseBody()
  const language = body.language === 'en' ? 'en' : 'sw'
  const file = body.audio instanceof File ? body.audio : null
  const transcript = typeof body.transcript === 'string' ? body.transcript : undefined
  if (!file && !transcript?.trim()) return c.json({ error: 'Record or upload audio first' }, 400)
  const audio = file ? Buffer.from(await file.arrayBuffer()) : undefined
  const job = startJob({ audio, transcript, language }, audio && { audio, ext: 'input' })
  return c.json({ jobId: job.id })
})

// Live visit: the browser streams 16 kHz mono float32 PCM while the promoter
// speaks; phrases come back over server-sent events as soon as they pause.
interface Live {
  language: 'sw' | 'en'
  events: LiveEvent[]
  listeners: Set<(e: LiveEvent) => void>
  pcm: Buffer[]
  stream: ReturnType<typeof liveTranscribe>
  error: string | null
}
const lives = new Map<string, Live>()

app.post('/api/live', async (c) => {
  const { language: l } = (await c.req.json().catch(() => ({}))) as { language?: string }
  const language = l === 'en' ? 'en' : 'sw'
  for (const [id, old] of lives) {
    old.stream.cancel()
    lives.delete(id)
  }
  const id = randomUUID()
  const live: Live = { language, events: [], listeners: new Set(), pcm: [], stream: null as never, error: null }
  const emit = (e: LiveEvent) => {
    if (e.type !== 'vad') live.events.push(e)
    for (const f of live.listeners) f(e)
  }
  live.stream = liveTranscribe(language, emit)
  lives.set(id, live)
  return c.json({ id })
})

app.post('/api/live/:id/audio', async (c) => {
  const live = lives.get(c.req.param('id'))
  if (!live) return c.json({ error: 'Unknown live session' }, 404)
  const buf = Buffer.from(await c.req.arrayBuffer())
  live.pcm.push(buf)
  live.stream.write(new Uint8Array(buf))
  return c.json({ ok: true })
})

app.get('/api/live/:id/events', (c) => {
  const live = lives.get(c.req.param('id'))
  if (!live) return c.json({ error: 'Unknown live session' }, 404)
  return streamSSE(c, async (s) => {
    let closed = false
    const send = (e: LiveEvent) => s.writeSSE({ data: JSON.stringify(e) }).catch(() => {})
    for (const e of live.events) await send(e)
    live.listeners.add(send)
    s.onAbort(() => {
      closed = true
      live.listeners.delete(send)
    })
    while (!closed && lives.has(c.req.param('id'))) await s.sleep(1000)
    live.listeners.delete(send)
  })
})

app.post('/api/live/:id/stop', async (c) => {
  const id = c.req.param('id')
  const live = lives.get(id)
  if (!live) return c.json({ error: 'Unknown live session' }, 404)
  try {
    await live.stream.end()
  } catch (e) {
    lives.delete(id)
    return c.json({ error: (e as Error).message }, 500)
  }
  const preview = live.events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join(' ').replace(/\s+/g, ' ').trim()
  const all = Buffer.concat(live.pcm)
  const samples = new Float32Array(all.buffer, all.byteOffset, Math.floor(all.length / 4))
  lives.delete(id)
  if (!samples.length) return c.json({ error: 'No audio was received from the microphone.' }, 400)
  const wav = pcmToWav(samples.map((x) => x * 32767), 16000)
  const job = startJob({ audio: wav, language: live.language }, { audio: wav, ext: 'wav' })
  return c.json({ jobId: job.id, preview })
})

app.get('/api/jobs/:id', (c) => {
  const job = jobs.get(c.req.param('id'))
  return job ? c.json(job) : c.json({ error: 'Unknown job' }, 404)
})

app.post('/api/visits', async (c) => {
  const v = (await c.req.json()) as Visit
  if (!v.id || !v.form) return c.json({ error: 'Invalid visit' }, 400)
  const form = normaliseForm(v.form)
  const danger = (v.danger ?? []).map((d) => ({ ...d, flagged: !!d.flagged }))
  const visit: Visit = { ...v, form, danger, urgent: danger.some((d) => d.flagged), readback: readbackText(form, danger), updatedAt: new Date().toISOString() }
  await ledger.saveVisit(visit)
  return c.json(visit)
})

app.get('/api/visits', async (c) => c.json(await ledger.listVisits()))

app.get('/api/visits/:id', async (c) => {
  const v = await ledger.getVisit(c.req.param('id'))
  return v ? c.json(v) : c.json({ error: 'Not found' }, 404)
})

const speaking = new Map<string, Promise<Buffer>>()
app.post('/api/readback', async (c) => {
  const { text } = (await c.req.json()) as { text: string }
  if (!text?.trim()) return c.json({ error: 'Nothing to read back' }, 400)
  let p = speaking.get(text)
  if (!p) {
    p = speak(text)
    speaking.set(text, p)
    p.catch(() => speaking.delete(text))
  }
  try {
    const wav = await p
    return new Response(new Uint8Array(wav), { headers: { 'content-type': 'audio/wav' } })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

app.get('/api/settings', (c) => c.json(settings))
app.post('/api/settings', async (c) => {
  const b = (await c.req.json()) as Partial<Settings>
  if (b.device?.trim()) settings.device = b.device.trim()
  if (b.role === 'promoter' || b.role === 'supervisor') settings.role = b.role
  if (typeof b.team === 'string') settings.team = b.team.trim()
  if (typeof b.supervisorAddress === 'string') settings.supervisorAddress = b.supervisorAddress.trim()
  ledger.role = settings.role
  ledger.device = settings.device
  await saveSettings()
  return c.json(settings)
})

app.get('/api/sync', async (c) => c.json(await ledger.status()))
app.post('/api/sync/start', async (c) => {
  if (!settings.team) return c.json({ error: 'Set a team code first' }, 400)
  try {
    ledger.role = settings.role
    ledger.device = settings.device
    await ledger.start(settings.team, settings.role === 'supervisor' ? null : settings.supervisorAddress || null)
    return c.json(await ledger.status())
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})
app.post('/api/sync/stop', async (c) => {
  await ledger.stop()
  return c.json(await ledger.status())
})

const webRoot = resolve('dist/web')
app.use('/*', serveStatic({ root: 'dist/web' }))
app.get('*', async (c) => {
  const index = join(webRoot, 'index.html')
  if (!existsSync(index)) return c.text('Web UI not built. Run: npm run build', 404)
  return c.html(await readFile(index, 'utf8'))
})

if (process.env.RIPOTI_WARM !== '0') {
  if (memoryMode === 'full') warm(['stt', 'llm'])
  else prefetch().catch((e: Error) => console.error('model download failed:', e.message))
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log(`Ripoti on http://localhost:${PORT}  (data: ${DATA}, role: ${settings.role})`)
})

async function exit() {
  server.close()
  await ledger.close().catch(() => {})
  await shutdown()
  process.exit(0)
}
process.on('SIGINT', exit)
process.on('SIGTERM', exit)
