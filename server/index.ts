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
import { modelStates, readbackText, shutdown, speak, warm, normaliseForm } from './qvac.ts'
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
    system: { platform: platform(), release: release(), cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMem: totalmem(), freeMem: freemem(), rss: process.memoryUsage().rss },
    dangerSigns: DANGER_SIGNS,
  }),
)

app.post('/api/models/warm', (c) => {
  warm(['stt', 'llm', 'tts'])
  return c.json({ ok: true })
})

app.post('/api/visits/process', async (c) => {
  const body = await c.req.parseBody()
  const language = body.language === 'en' ? 'en' : 'sw'
  const file = body.audio instanceof File ? body.audio : null
  const transcript = typeof body.transcript === 'string' ? body.transcript : undefined
  if (!file && !transcript?.trim()) return c.json({ error: 'Record or upload audio first' }, 400)
  const audio = file ? Buffer.from(await file.arrayBuffer()) : undefined
  const job: Job = { id: randomUUID(), stage: 'queued', stages: [], transcript: null, visit: null, error: null }
  jobs.set(job.id, job)
  processVisit({ audio, transcript, language, device: settings.device }, (stage, status, detail) => {
    job.stage = stage
    job.stages.push({ stage, status, at: Date.now() })
    if (stage === 'transcribe' && status === 'done') job.transcript = String(detail)
  })
    .then(async (visit) => {
      if (audio) await writeFile(join(DATA, 'audio', `${visit.id}.input`), audio)
      job.visit = visit
      job.transcript = visit.transcript
      job.stage = 'done'
    })
    .catch((e: Error) => {
      job.error = e.message
      job.stage = 'error'
    })
  return c.json({ jobId: job.id })
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

if (process.env.RIPOTI_WARM !== '0') warm(['stt', 'llm'])

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
