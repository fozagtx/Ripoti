// Word error rate of QVAC Whisper on real human Kiswahili speech:
// Google FLEURS sw_ke test split (CC BY 4.0). Download with bench/get-fleurs.sh.
// Usage: RIPOTI_STT=turbo|small node bench/stt.ts [count]
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { toWhisperWav } from '../server/audio.ts'
import { stt, shutdown, modelStates } from '../server/qvac.ts'
import { wer, cer } from './wer.ts'

const dir = process.env.FLEURS_DIR ?? join(homedir(), 'data/fleurs')
const count = Number(process.argv[2] ?? 50)
const rows = (await readFile(join(dir, 'test.tsv'), 'utf8')).trim().split('\n').map((l) => l.split('\t'))
// Take the first `count` distinct utterances (FLEURS repeats sentences across speakers).
const seen = new Set<string>()
const pick = rows.filter((r) => !seen.has(r[0]) && seen.add(r[0])).slice(0, count)

let we = 0, wn = 0, ce = 0, cn = 0, ms = 0, audioSec = 0
const out: unknown[] = []
for (const r of pick) {
  const raw = await readFile(join(dir, 'test', r[1]))
  const wav = await toWhisperWav(raw)
  audioSec += (wav.length - 44) / 32000
  const t0 = performance.now()
  const hyp = await stt(wav, 'sw')
  const t = performance.now() - t0
  ms += t
  const w = wer(r[3], hyp), c = cer(r[3], hyp)
  we += w.errors; wn += w.words; ce += c.errors; cn += c.chars
  out.push({ file: r[1], ref: r[3], hyp, wer: w.errors / w.words, ms: Math.round(t) })
  console.log(r[1], (w.errors / w.words).toFixed(2), Math.round(t), 'ms')
}
const model = modelStates().find((m) => m.role === 'stt')!
const summary = { model: model.name, loadMs: model.loadMs, utterances: pick.length, wer: we / wn, cer: ce / cn, audioSeconds: audioSec, inferenceSeconds: ms / 1000, realTimeFactor: ms / 1000 / audioSec, peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024) }
console.log(JSON.stringify(summary, null, 2))
await writeFile(new URL(`./results/stt-${process.env.RIPOTI_STT ?? 'turbo'}.json`, import.meta.url), JSON.stringify({ summary, rows: out }, null, 2))
await shutdown()
