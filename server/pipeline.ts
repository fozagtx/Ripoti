import { randomUUID } from 'node:crypto'
import { toWhisperWav } from './audio.ts'
import { dangerSigns, extract, modelNames, readbackText, stt } from './qvac.ts'
import type { StageTiming, Visit } from './types.ts'

export type Stage = StageTiming['stage']
export type Progress = (stage: Stage, status: 'start' | 'done', detail?: unknown) => void

async function timed<T>(timings: StageTiming[], stage: Stage, onProgress: Progress, fn: () => Promise<T>): Promise<T> {
  onProgress(stage, 'start')
  const t0 = performance.now()
  const out = await fn()
  timings.push({ stage, ms: Math.round(performance.now() - t0) })
  onProgress(stage, 'done', out)
  return out
}

export async function processVisit(
  input: { audio?: Buffer; transcript?: string; language: 'sw' | 'en'; device: string },
  onProgress: Progress = () => {},
): Promise<Visit> {
  const timings: StageTiming[] = []
  let transcript = input.transcript?.trim() ?? ''
  if (input.audio) {
    const wav = await timed(timings, 'normalise', onProgress, () => toWhisperWav(input.audio!))
    transcript = await timed(timings, 'transcribe', onProgress, () => stt(wav, input.language))
  }
  if (!transcript) throw new Error('No speech was recognised. Record again closer to the microphone.')
  const form = await timed(timings, 'extract', onProgress, () => extract(transcript))
  const danger = await timed(timings, 'danger', onProgress, () => dangerSigns(transcript, form))
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    device: input.device,
    language: input.language,
    transcript,
    form,
    danger,
    urgent: danger.some((d) => d.flagged),
    readback: readbackText(form, danger),
    timings,
    models: modelNames(),
  }
}
