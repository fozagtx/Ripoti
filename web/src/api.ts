export interface Member { role: string; ageMonths: number | null; symptoms: string[] }
export interface VisitForm {
  householdId: string; members: Member[]; pregnant: boolean; gestationMonths: number | null
  vaccinesUpToDate: boolean | null; referralGiven: boolean; followUp: string; summary: string
}
export interface DangerResult { id: string; label: string; labelSw: string; evidence: string; support: number; flagged: boolean }
export interface Visit {
  id: string; createdAt: string; updatedAt: string; device: string; language: 'sw' | 'en'; transcript: string
  form: VisitForm; danger: DangerResult[]; urgent: boolean; readback: string
  timings: { stage: string; ms: number }[]; models: Record<string, string>; source?: string
}
export interface ModelState { role: string; name: string; status: 'idle' | 'loading' | 'ready' | 'error'; progress: number; error: string | null; loadMs: number | null }
export interface FitCheck {
  memoryMode: 'lean' | 'full'; execution: 'sequential' | 'concurrent'; totalBytes: number | null; cores: number | null; cpu: string | null; gpus: number
  verdict: 'likely-fits' | 'likely-too-large' | 'unknown' | 'error'; basis: string | null; budgetBytes: number | null
  models: { name: string; verdict: string; evidence: string; floorBytes: number | null }[]; error: string | null
}
export interface Status {
  device: string; role: 'promoter' | 'supervisor'; models: ModelState[]; memoryMode: 'lean' | 'full'; fit: FitCheck
  system: { platform: string; release: string; cpus: number; cpuModel: string; totalMem: number; freeMem: number; rss: number; qvacRss: number | null }
  dangerSigns: { id: string; group: string; label: string; labelSw: string }[]
}
export interface Job { id: string; stage: string; stages: { stage: string; status: string; at: number }[]; transcript: string | null; visit: Visit | null; error: string | null }
export interface Settings { device: string; role: 'promoter' | 'supervisor'; team: string; supervisorAddress: string }
export interface Peer { key: string; device: string; role: string; connected: boolean; visits: number; lastSeen: string | null }
export interface SyncStatus { role: string; device: string; team: string | null; running: boolean; supervisorAddress: string | null; localAddresses: string[]; ownKey: string; peers: Peer[]; error: string | null }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`)
  return body as T
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  status: () => req<Status>('/api/status'),
  warm: () => req('/api/models/warm', { method: 'POST' }),
  process: (fd: FormData) => req<{ jobId: string }>('/api/visits/process', { method: 'POST', body: fd }),
  job: (id: string) => req<Job>(`/api/jobs/${id}`),
  save: (v: Visit) => req<Visit>('/api/visits', json(v)),
  visits: () => req<Visit[]>('/api/visits'),
  visit: (id: string) => req<Visit>(`/api/visits/${id}`),
  settings: () => req<Settings>('/api/settings'),
  saveSettings: (s: Partial<Settings>) => req<Settings>('/api/settings', json(s)),
  sync: () => req<SyncStatus>('/api/sync'),
  startSync: () => req<SyncStatus>('/api/sync/start', { method: 'POST' }),
  stopSync: () => req<SyncStatus>('/api/sync/stop', { method: 'POST' }),
  liveStart: (language: 'sw' | 'en') => req<{ id: string }>('/api/live', json({ language })),
  liveAudio: (id: string, pcm: Float32Array) =>
    req(`/api/live/${id}/audio`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pcm.slice().buffer as ArrayBuffer }),
  liveStop: (id: string) => req<{ jobId: string; preview: string }>(`/api/live/${id}/stop`, { method: 'POST' }),
  readback: async (text: string) => {
    const r = await fetch('/api/readback', json({ text }))
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Read-back failed')
    return URL.createObjectURL(await r.blob())
  },
}


export const fmtAge = (m: number | null) => (m === null ? '—' : m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yr`)
export const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
export const fmtBytes = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`
export const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
