// End-to-end accuracy of the visit pipeline on bench/cases.json.
// mode=audio: Chatterbox-spoken clips (bench/audio, run bench/make-audio.ts first) -> Whisper -> LLM.
// mode=text:  the reference note text -> LLM (isolates extraction from speech errors).
// Usage: node bench/extract.ts audio|text
import { readFile, writeFile } from 'node:fs/promises'
import { processVisit } from '../server/pipeline.ts'
import { shutdown, modelNames, modelStates } from '../server/qvac.ts'

interface Case { id: string; text: string; expect: { householdId: string; pregnant: boolean; gestationMonths: number | null; vaccinesUpToDate: boolean | null; dangerSigns: string[] } }
const mode = process.argv[2] === 'text' ? 'text' : 'audio'
const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8')) as Case[]

const fields = { householdId: 0, pregnant: 0, gestationMonths: 0, vaccinesUpToDate: 0 }
let tp = 0, fp = 0, fn = 0, urgentRight = 0
const totals: Record<string, number> = {}
const rows: unknown[] = []
for (const c of cases) {
  const v = await processVisit(
    mode === 'audio'
      ? { audio: await readFile(new URL(`./audio/${c.id}.wav`, import.meta.url)), language: 'sw', device: 'bench' }
      : { transcript: c.text, language: 'sw', device: 'bench' },
  )
  for (const k of Object.keys(fields) as (keyof typeof fields)[]) if (v.form[k] === c.expect[k]) fields[k]++
  const got = v.danger.filter((d) => d.flagged).map((d) => d.id)
  tp += got.filter((g) => c.expect.dangerSigns.includes(g)).length
  fp += got.filter((g) => !c.expect.dangerSigns.includes(g)).length
  fn += c.expect.dangerSigns.filter((e) => !got.includes(e)).length
  if (v.urgent === c.expect.dangerSigns.length > 0) urgentRight++
  for (const t of v.timings) totals[t.stage] = (totals[t.stage] ?? 0) + t.ms
  rows.push({ id: c.id, transcript: v.transcript, form: v.form, flagged: got, expected: c.expect.dangerSigns, timings: v.timings })
  console.log(c.id, 'flagged', got.join(',') || '-', 'expected', c.expect.dangerSigns.join(',') || '-', v.timings.map((t) => `${t.stage}:${t.ms}`).join(' '))
}
const n = cases.length
const summary = {
  mode, models: modelNames(), loadMs: Object.fromEntries(modelStates().map((m) => [m.role, m.loadMs])), cases: n,
  fieldAccuracy: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v / n])),
  dangerSigns: { precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), truePositives: tp, falsePositives: fp, falseNegatives: fn },
  referralDecisionAccuracy: urgentRight / n,
  meanStageMs: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v / n)])),
  peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
}
console.log(JSON.stringify(summary, null, 2))
await writeFile(new URL(`./results/extract-${mode}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 2))
await shutdown()
