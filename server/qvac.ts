import {
  loadModel,
  unloadModel,
  transcribe,
  completion,
  textToSpeech,
  close,
  WHISPER_SMALL_Q8_0,
  WHISPER_LARGE_V3_TURBO,
  QWEN3_4B_INST_Q4_K_M,
  GEMMA4_4B_MULTIMODAL_Q4_K_M,
  TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0,
  TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0,
} from '@qvac/sdk'
import { DANGER_SIGNS, EVIDENCE_THRESHOLD } from './protocol.ts'
import { VISIT_SCHEMA, type DangerResult, type VisitForm } from './types.ts'
import { pcmToWav } from './audio.ts'
import { digitsToSwahiliWords, swahiliNumeralsToDigits } from './swnum.ts'
import { sentenceOf, statedDays } from './duration.ts'
import { groundForm } from './ground.ts'
import { readbackText } from './readback.ts'
export { readbackText }

type Src = { readonly src: string }

export interface ModelChoice {
  key: string
  name: string
  src: Src
}

export const STT_MODELS: Record<string, ModelChoice> = {
  turbo: { key: 'turbo', name: 'whisper-large-v3-turbo', src: WHISPER_LARGE_V3_TURBO },
  small: { key: 'small', name: 'whisper-small q8_0', src: WHISPER_SMALL_Q8_0 },
}

export const LLM_MODELS: Record<string, ModelChoice> = {
  gemma4b: { key: 'gemma4b', name: 'Gemma 4 4B Q4_K_M', src: GEMMA4_4B_MULTIMODAL_Q4_K_M },
  qwen4b: { key: 'qwen4b', name: 'Qwen3-4B-Instruct Q4_K_M', src: QWEN3_4B_INST_Q4_K_M },
}

export const TTS_MODEL = { name: 'Chatterbox multilingual T3 + S3Gen Q4_0', src: TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0 }

export type Role = 'stt' | 'llm' | 'tts'
export type ModelState = { role: Role; name: string; status: 'idle' | 'loading' | 'ready' | 'error'; progress: number; error: string | null; loadMs: number | null }

const state: Record<Role, ModelState> = {
  stt: { role: 'stt', name: STT_MODELS[process.env.RIPOTI_STT ?? 'turbo']?.name ?? STT_MODELS.turbo.name, status: 'idle', progress: 0, error: null, loadMs: null },
  llm: { role: 'llm', name: LLM_MODELS[process.env.RIPOTI_LLM ?? 'gemma4b']?.name ?? LLM_MODELS.gemma4b.name, status: 'idle', progress: 0, error: null, loadMs: null },
  tts: { role: 'tts', name: TTS_MODEL.name, status: 'idle', progress: 0, error: null, loadMs: null },
}
const ids: Partial<Record<Role, string>> = {}
const loading: Partial<Record<Role, Promise<string>>> = {}

export function modelStates() {
  return Object.values(state)
}

function sttChoice() {
  return STT_MODELS[process.env.RIPOTI_STT ?? 'turbo'] ?? STT_MODELS.turbo
}
function llmChoice() {
  return LLM_MODELS[process.env.RIPOTI_LLM ?? 'gemma4b'] ?? LLM_MODELS.gemma4b
}

// QVAC runs one worker process; loads are serialised so two model
// downloads/initialisations never race inside it.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

function ensure(role: Role): Promise<string> {
  if (ids[role]) return Promise.resolve(ids[role]!)
  if (loading[role]) return loading[role]!
  const s = state[role]
  const onProgress = (p: { percentage: number }) => {
    s.progress = Math.round(p.percentage)
  }
  const p = serial(async () => {
    s.status = 'loading'
    s.error = null
    const t0 = performance.now()
    let id: string
    if (role === 'stt') {
      id = await loadModel({
        modelSrc: sttChoice().src,
        modelConfig: { language: sttLanguage, translate: false, no_timestamps: true, strategy: 'greedy', suppress_nst: true },
        onProgress,
      } as never)
    } else if (role === 'llm') {
      id = await loadModel({ modelSrc: llmChoice().src, modelConfig: { ctx_size: 4096 }, onProgress } as never)
    } else {
      id = await loadModel({
        modelSrc: TTS_MODEL.src,
        modelConfig: { ttsEngine: 'chatterbox', language: 'sw', s3genModelSrc: TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0, cfmSteps: 1, threads: 8 },
        onProgress,
      } as never)
    }
    s.loadMs = Math.round(performance.now() - t0)
    s.status = 'ready'
    s.progress = 100
    ids[role] = id
    return id
  })
  loading[role] = p
  p.catch((e: Error) => {
    s.status = 'error'
    s.error = e.message
  }).finally(() => delete loading[role])
  return p
}

export function warm(roles: Role[]) {
  for (const r of roles) ensure(r).catch(() => {})
}

let sttLanguage: 'sw' | 'en' = 'sw'

// Whisper's language is fixed at load time, so switching language reloads it.
export async function stt(wav: Buffer, language: 'sw' | 'en'): Promise<string> {
  if (language !== sttLanguage) {
    await loading.stt?.catch(() => {})
    const old = ids.stt
    delete ids.stt
    sttLanguage = language
    state.stt.status = 'idle'
    if (old) await serial(() => unloadModel({ modelId: old }).catch(() => {}))
  }
  const id = await ensure('stt')
  const out = await serial(() => transcribe({ modelId: id, audioChunk: wav } as never))
  return String(out).replace(/\s+/g, ' ').trim()
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
  const id = await ensure('llm')
  const run = await serial(async () => {
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
  const id = await ensure('llm')
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
  const final = await serial(() =>
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
  const id = await ensure('tts')
  return serial(async () => {
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

export function modelNames() {
  return { stt: sttChoice().name, llm: llmChoice().name, tts: TTS_MODEL.name }
}

export async function shutdown() {
  for (const id of Object.values(ids)) await unloadModel({ modelId: id! }).catch(() => {})
  await close().catch(() => {})
}
