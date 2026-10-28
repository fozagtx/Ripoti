import {
  loadModel,
  unloadModel,
  transcribe,
  transcribeStream,
  downloadAsset,
  completion,
  textToSpeech,
  close,
  WHISPER_SMALL_Q8_0,
  WHISPER_LARGE_V3_TURBO,
  QWEN3_4B_INST_Q4_K_M,
  GEMMA4_4B_MULTIMODAL_Q4_K_M,
  GEMMA4_2B_MULTIMODAL_Q4_K_M,
  TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0,
  TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0,
  VAD_SILERO_5_1_2,
} from '@qvac/sdk'
import { totalmem } from 'node:os'
import { DANGER_SIGNS, EVIDENCE_THRESHOLD } from './protocol.ts'
import { VISIT_SCHEMA, type DangerResult, type VisitForm } from './types.ts'
import { pcmToWav } from './audio.ts'
import { digitsToSwahiliWords, swahiliNumeralsToDigits } from './swnum.ts'
import { durationEvidence, sentenceOf, statedDays } from './duration.ts'
import { groundForm } from './ground.ts'
import { readbackText } from './readback.ts'
export { readbackText }

type Src = { readonly src: string }

export interface ModelChoice {
  key: string
  name: string
  src: Src
}

export const DEFAULT_LLM = 'gemma4b'
// Live captions use whisper-small so text keeps up with speech on a laptop
// CPU; the saved transcript is re-done with large-v3-turbo when you stop.
export const LIVE_SEGMENT_S = 6

export const STT_MODELS: Record<string, ModelChoice> = {
  turbo: { key: 'turbo', name: 'whisper-large-v3-turbo', src: WHISPER_LARGE_V3_TURBO },
  small: { key: 'small', name: 'whisper-small q8_0', src: WHISPER_SMALL_Q8_0 },
}

export const LLM_MODELS: Record<string, ModelChoice> = {
  gemma4b: { key: 'gemma4b', name: 'Gemma 4 4B Q4_K_M', src: GEMMA4_4B_MULTIMODAL_Q4_K_M },
  gemma2b: { key: 'gemma2b', name: 'Gemma 4 2B Q4_K_M', src: GEMMA4_2B_MULTIMODAL_Q4_K_M },
  qwen4b: { key: 'qwen4b', name: 'Qwen3-4B-Instruct Q4_K_M', src: QWEN3_4B_INST_Q4_K_M },
}

export const TTS_MODEL = { name: 'Chatterbox multilingual T3 + S3Gen Q4_0', src: TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0 }

export type Role = 'stt' | 'llm' | 'tts'
export type ModelState = { role: Role; name: string; status: 'idle' | 'loading' | 'ready' | 'error'; progress: number; error: string | null; loadMs: number | null }

const state: Record<Role, ModelState> = {
  stt: { role: 'stt', name: STT_MODELS[process.env.RIPOTI_STT ?? 'turbo']?.name ?? STT_MODELS.turbo.name, status: 'idle', progress: 0, error: null, loadMs: null },
  llm: { role: 'llm', name: LLM_MODELS[process.env.RIPOTI_LLM ?? DEFAULT_LLM]?.name ?? LLM_MODELS[DEFAULT_LLM].name, status: 'idle', progress: 0, error: null, loadMs: null },
  tts: { role: 'tts', name: TTS_MODEL.name, status: 'idle', progress: 0, error: null, loadMs: null },
}
export type MemoryMode = 'lean' | 'full'
// Lean keeps one QVAC model in memory at a time, so peak RAM is the largest
// single model rather than all three together. It is the default below 24 GB.
export const memoryMode: MemoryMode =
  process.env.RIPOTI_MEMORY === 'full' || process.env.RIPOTI_MEMORY === 'lean'
    ? process.env.RIPOTI_MEMORY
    : totalmem() < 24 * 1024 ** 3
      ? 'lean'
      : 'full'

const loaded: Partial<Record<Role, { key: string; id: string }>> = {}

export function modelStates() {
  return Object.values(state)
}

function sttChoice() {
  return STT_MODELS[process.env.RIPOTI_STT ?? 'turbo'] ?? STT_MODELS.turbo
}
function liveSttChoice() {
  return STT_MODELS[process.env.RIPOTI_LIVE_STT ?? 'small'] ?? STT_MODELS.small
}
function llmChoice() {
  return LLM_MODELS[process.env.RIPOTI_LLM ?? DEFAULT_LLM] ?? LLM_MODELS[DEFAULT_LLM]
}

// QVAC runs one worker process. Every load, unload and inference goes
// through this queue, so models never race or overlap in memory.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

async function release(role: Role) {
  const cur = loaded[role]
  if (!cur) return
  delete loaded[role]
  state[role].status = 'idle'
  state[role].progress = 0
  await unloadModel({ modelId: cur.id }).catch(() => {})
}

type Loader = (onProgress: (p: { percentage: number }) => void) => Promise<string>

async function acquire(role: Role, key: string, load: Loader): Promise<string> {
  const cur = loaded[role]
  if (cur?.key === key) return cur.id
  await release(role)
  if (memoryMode === 'lean') for (const r of Object.keys(loaded) as Role[]) await release(r)
  const s = state[role]
  s.status = 'loading'
  s.error = null
  s.progress = 0
  const t0 = performance.now()
  try {
    const id = await load((p) => (s.progress = Math.round(p.percentage)))
    s.loadMs = Math.round(performance.now() - t0)
    s.status = 'ready'
    s.progress = 100
    loaded[role] = { key, id }
    return id
  } catch (e) {
    s.status = 'error'
    s.error = (e as Error).message
    throw e
  }
}

const WHISPER_BASE = { translate: false, no_timestamps: true, strategy: 'greedy', suppress_nst: true }

function sttSpec(language: 'sw' | 'en', live: boolean): [string, Loader] {
  const choice = live ? liveSttChoice() : sttChoice()
  state.stt.name = choice.name
  const modelConfig = live
    ? {
        ...WHISPER_BASE,
        language,
        audio_format: 'f32le',
        suppress_blank: true,
        temperature: 0,
        vadModelSrc: VAD_SILERO_5_1_2,
        vad_params: { threshold: 0.5, min_speech_duration_ms: 250, min_silence_duration_ms: 400, max_speech_duration_s: LIVE_SEGMENT_S, speech_pad_ms: 150 },
      }
    : { ...WHISPER_BASE, language }
  return [`${choice.key}:${language}:${live ? 'live' : 'file'}`, (onProgress) => loadModel({ modelSrc: choice.src, modelConfig, onProgress } as never)]
}

const llmSpec = (): [string, Loader] => {
  const c = llmChoice()
  return [c.key, (onProgress) => loadModel({ modelSrc: c.src, modelConfig: { ctx_size: 4096 }, onProgress } as never)]
}

const ttsSpec = (): [string, Loader] => [
  'chatterbox:sw',
  (onProgress) =>
    loadModel({
      modelSrc: TTS_MODEL.src,
      modelConfig: { ttsEngine: 'chatterbox', language: 'sw', s3genModelSrc: TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0, cfmSteps: 1, threads: 8 },
      onProgress,
    } as never),
]

function withModel<T>(role: Role, [key, load]: [string, Loader], fn: (id: string) => Promise<T>): Promise<T> {
  return serial(async () => fn(await acquire(role, key, load)))
}

// Downloads every model to the local cache without loading it, so the
// first visit works with the network off.
export async function prefetch() {
  const srcs = [sttChoice().src, liveSttChoice().src, VAD_SILERO_5_1_2, llmChoice().src, TTS_MODEL.src, TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0]
  for (const s of new Set(srcs)) await downloadAsset({ assetSrc: s } as never)
}

// In full mode the models stay loaded, so warming them up front saves time.
export function warm(roles: Role[] = ['stt', 'llm', 'tts']) {
  for (const r of roles) {
    const spec = r === 'stt' ? sttSpec('sw', false) : r === 'llm' ? llmSpec() : ttsSpec()
    withModel(r, spec, async (id) => id).catch(() => {})
  }
}

export async function stt(wav: Buffer, language: 'sw' | 'en'): Promise<string> {
  const out = await withModel('stt', sttSpec(language, false), (id) => transcribe({ modelId: id, audioChunk: wav } as never) as Promise<unknown>)
  return String(out).replace(/\s+/g, ' ').trim()
}

export type LiveEvent = { type: 'ready' } | { type: 'text'; text: string } | { type: 'vad'; speaking: boolean } | { type: 'endOfTurn' }

// Live transcription: Silero VAD cuts the microphone stream into phrases and
// Whisper transcribes each phrase as soon as the speaker pauses.
export function liveTranscribe(language: 'sw' | 'en', onEvent: (e: LiveEvent) => void) {
  const pending: Uint8Array[] = []
  let session: { write(b: Uint8Array): void; end(): void; destroy(): void } | null = null
  let ended = false
  let lastEvent = Date.now()
  const done = withModel('stt', sttSpec(language, true), async (id) => {
    const s = (await transcribeStream({ modelId: id, emitVadEvents: true, endOfTurnSilenceMs: 700 } as never)) as unknown as {
      write(b: Uint8Array): void
      end(): void
      destroy(): void
      [Symbol.asyncIterator](): AsyncIterator<{ type: string; text?: string; speaking?: boolean }>
    }
    session = s
    for (const b of pending.splice(0)) s.write(b)
    if (ended) s.end()
    onEvent({ type: 'ready' })
    for await (const e of s) {
      if (e.type !== 'vad') lastEvent = Date.now()
      if (e.type === 'text' && e.text?.trim()) onEvent({ type: 'text', text: e.text.trim() })
      else if (e.type === 'vad') onEvent({ type: 'vad', speaking: !!e.speaking })
      else if (e.type === 'endOfTurn') onEvent({ type: 'endOfTurn' })
    }
  })
  return {
    write(b: Uint8Array) {
      if (ended) return
      if (session) session.write(b)
      else pending.push(b)
    },
    // Pads with silence and waits for Whisper to finish the phrase in
    // flight, since ending the session drops any unfinished segment.
    async end() {
      if (ended) return done
      ended = true
      if (session) {
        session.write(new Uint8Array(new Float32Array(16000 * 1.5).buffer))
        const t0 = Date.now()
        while (Date.now() - t0 < 15000 && (Date.now() - t0 < 2000 || Date.now() - lastEvent < 2500)) await new Promise((r) => setTimeout(r, 250))
        session.end()
      }
      return done
    },
    cancel() {
      ended = true
      session?.destroy()
    },
  }
}

const GLOSSARY = `Swahili glossary: miezi = months, miaka = years, siku = days, wiki = weeks, kaya = household, mjamzito = pregnant, homa = fever, kikohozi = cough, kuhara = diarrhoea, kutapika = vomiting, degedege = convulsions, kunyonya = breastfeed, chanjo = vaccines, zimekamilika = complete, rufaa = referral, damu = blood, kichwa = head, tumbo = stomach. kuharisha = diarrhoea, kupumua = breathing, kifua = chest, ukungu = blurred vision, hachezi = not moving, viganja = palms, nyayo = soles, njano = yellow, amelegea = lethargic/very weak, kifua kikuu = tuberculosis, babu = grandfather, bibi = grandmother, mchanga = newborn.`

const SYSTEM = `You turn a community health promoter's household visit note (Swahili or English, from speech recognition, may contain recognition errors) into a JSON record.
Rules:
- Only include facts stated in the note. Never invent people, ages or symptoms.
- householdId: the household number spoken (e.g. "kaya namba 0142" -> "0142"); empty string if none.
- members: one entry per person mentioned; role is one of mother, child, newborn, father, elder, other; ageMonths converts years to months, null if not said.
- symptoms, followUp and summary are in English.
- followUp is an empty string unless the note states a follow-up action or date.
- pregnant is true only if the note says someone is pregnant; gestationMonths if stated.
- vaccinesUpToDate is null when vaccines are not mentioned.
- referralGiven is true only if the promoter says they referred someone.
${GLOSSARY}`



export async function extract(transcript: string): Promise<VisitForm> {
  const run = await withModel('llm', llmSpec(), async (id) => {
    const r = completion({
      modelId: id,
      stream: true,
      generationParams: { predict: 600, temp: 0, reasoning_budget: 0 },
      history: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${swahiliNumeralsToDigits(transcript)} /no_think` },
      ],
      responseFormat: { type: 'json_schema', json_schema: { name: 'visit', schema: VISIT_SCHEMA as never } },
    } as never)
    return (r as { final: Promise<{ contentText: string }> }).final
  })
  return groundForm(normaliseForm(JSON.parse(run.contentText)), transcript)
}

export function normaliseForm(f: Partial<VisitForm>): VisitForm {
  return {
    householdId: String(f.householdId ?? '').replace(/[^0-9A-Za-z-]/g, ''),
    members: Array.isArray(f.members)
      ? f.members.map((m) => ({ role: String(m.role ?? 'other'), ageMonths: Number.isFinite(m.ageMonths) ? Number(m.ageMonths) : null, symptoms: (m.symptoms ?? []).map(String) }))
      : [],
    pregnant: !!f.pregnant,
    gestationMonths: Number.isFinite(f.gestationMonths) ? Number(f.gestationMonths) : null,
    vaccinesUpToDate: typeof f.vaccinesUpToDate === 'boolean' ? f.vaccinesUpToDate : null,
    referralGiven: !!f.referralGiven,
    followUp: String(f.followUp ?? ''),
    summary: String(f.summary ?? ''),
  }
}

function relevantSigns(form: VisitForm) {
  const groups = new Set<string>(['general'])
  for (const m of form.members) {
    if (m.role === 'newborn' || (m.ageMonths !== null && m.ageMonths < 2)) groups.add('newborn')
    if (m.role === 'child' || m.role === 'newborn' || (m.ageMonths !== null && m.ageMonths < 60)) groups.add('child')
  }
  if (form.pregnant) groups.add('pregnancy')
  if (form.members.length === 0) ['child', 'pregnancy', 'newborn'].forEach((g) => groups.add(g))
  return DANGER_SIGNS.filter((s) => groups.has(s.group))
}

const words = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)

// Share of the evidence quote's words that occur in the note. A sign only
// counts when the model quotes the note, which stops invented findings.
export function evidenceSupport(evidence: string, note: string) {
  const ev = words(evidence)
  if (!ev.length) return 0
  const have = new Set(words(note))
  return ev.filter((w) => have.has(w)).length / ev.length
}

// The LLM checks the note against the iCCM/ANC danger-sign list and must
// quote the words that show each sign. Quotes are verified against the note.
export async function dangerSigns(transcript: string, form: VisitForm): Promise<DangerResult[]> {
  const signs = relevantSigns(form)
  const note = swahiliNumeralsToDigits(transcript)
  const list = signs.map((s) => `- ${s.id}: ${s.instruction}`).join('\n')
  const schema = {
    type: 'object',
    properties: {
      found: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string', enum: signs.map((s) => s.id) }, evidence: { type: 'string', description: 'Exact words copied from the note' } },
          required: ['id', 'evidence'],
        },
      },
    },
    required: ['found'],
  }
  const final = await withModel('llm', llmSpec(), (id) =>
    (completion({
      modelId: id,
      stream: true,
      generationParams: { predict: 300, temp: 0, reasoning_budget: 0 },
      history: [
        {
          role: 'system',
          content: `You check a community health visit note (Swahili or English) for danger signs that need urgent referral.
Danger signs:
${list}
Return only signs the note clearly states. For each, copy the exact words from the note as evidence. If the note says a sign is absent, do not return it. Return an empty list when none apply.
${GLOSSARY}`,
        },
        { role: 'user', content: `${note} /no_think` },
      ],
      responseFormat: { type: 'json_schema', json_schema: { name: 'danger', schema } },
    } as never) as unknown as { final: Promise<{ contentText: string }> }).final,
  )
  const found = (JSON.parse(final.contentText).found ?? []) as { id: string; evidence: string }[]
  return signs.map((s) => {
    const hit = found.filter((f) => f.id === s.id).map((f) => ({ ...f, support: evidenceSupport(f.evidence, note) })).sort((a, b) => b.support - a.support)[0]
    const backup = !hit && s.minDays && s.symptom ? durationEvidence(s.symptom, s.minDays, note) : null
    if (backup) return { id: s.id, label: s.label, labelSw: s.labelSw, evidence: backup, support: 1, flagged: true }
    const support = hit?.support ?? 0
    const longEnough = !s.minDays || (!!hit && (statedDays(sentenceOf(hit.evidence, note)) ?? 0) >= s.minDays)
    return { id: s.id, label: s.label, labelSw: s.labelSw, evidence: hit?.evidence ?? '', support, flagged: !!hit && support >= EVIDENCE_THRESHOLD && longEnough }
  })
}

// Chatterbox is run one sentence at a time so a long read-back cannot
// run on without stopping and latency stays predictable.
export function sentences(text: string) {
  return text.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean)
}

export async function speak(text: string): Promise<Buffer> {
  return withModel('tts', ttsSpec(), async (id) => {
    const all: number[] = []
    let rate = 24000
    for (const sentence of sentences(text)) {
      const r = textToSpeech({ modelId: id, text: digitsToSwahiliWords(sentence), inputType: 'text', stream: false } as never) as unknown as {
        buffer: Promise<number[]>
        sampleRate: Promise<number>
      }
      const samples = await r.buffer
      rate = (await r.sampleRate) || rate
      for (const x of samples) all.push(x)
      for (let i = 0; i < rate / 4; i++) all.push(0)
    }
    return pcmToWav(all, rate)
  })
}

// The loads Ripoti makes, in loadModel's own parameters, for QVAC's
// assessModelFit check.
export function fitCandidates() {
  return [
    { modelSrc: sttChoice().src, modelType: 'whispercpp-transcription', modelConfig: { language: 'sw' } },
    { modelSrc: llmChoice().src, modelType: 'llamacpp-completion', modelConfig: { ctx_size: 4096 } },
    { modelSrc: TTS_MODEL.src, modelType: 'tts-ggml', modelConfig: { ttsEngine: 'chatterbox', language: 'sw', s3genModelSrc: TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0 } },
  ]
}

export function modelNames() {
  return { stt: sttChoice().name, llm: llmChoice().name, tts: TTS_MODEL.name }
}

export async function shutdown() {
  await serial(async () => {
    for (const r of Object.keys(loaded) as Role[]) await release(r)
  })
  await close().catch(() => {})
}
