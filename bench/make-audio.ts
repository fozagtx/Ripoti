// Speaks each benchmark visit note with QVAC Chatterbox (Swahili) so the
// full voice pipeline can be exercised end to end. These clips are
// synthetic speech; human speech accuracy is measured on FLEURS (bench/stt.ts).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { speak, shutdown } from '../server/qvac.ts'

const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8')) as { id: string; text: string }[]
await mkdir(new URL('./audio/', import.meta.url), { recursive: true })
for (const c of cases) {
  const out = new URL(`./audio/${c.id}.wav`, import.meta.url)
  if (existsSync(out)) continue
  const t0 = performance.now()
  await writeFile(out, await speak(c.text))
  console.log(c.id, Math.round(performance.now() - t0), 'ms')
}
await shutdown()
