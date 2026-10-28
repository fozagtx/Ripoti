import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim()}`))))
  })
}

// Any recorded/uploaded audio -> 16 kHz mono 16-bit WAV with loudness
// normalisation, so quiet phone recordings still reach Whisper.
export async function toWhisperWav(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'ripoti-'))
  try {
    const src = join(dir, 'in')
    const dst = join(dir, 'out.wav')
    await writeFile(src, input)
    await ffmpeg(['-i', src, '-ac', '1', '-ar', '16000', '-af', 'dynaudnorm=f=150:g=15', '-c:a', 'pcm_s16le', dst])
    return await readFile(dst)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export function pcmToWav(samples: ArrayLike<number>, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-32768, Math.min(32767, Math.round(samples[i])))
    data.writeInt16LE(s, i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
