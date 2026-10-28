import { assessModelFit, getSystemResources } from '@qvac/sdk'
import { fitCandidates, memoryMode } from './qvac.ts'

type Metric<T> = { status: string; value?: T }
const val = <T>(m: Metric<T> | undefined): T | null => (m?.status === 'supported' && m.value !== undefined ? m.value : null)

export interface FitCheck {
  memoryMode: typeof memoryMode
  execution: 'sequential' | 'concurrent'
  totalBytes: number | null
  cores: number | null
  cpu: string | null
  gpus: number
  verdict: 'likely-fits' | 'likely-too-large' | 'unknown' | 'error'
  basis: string | null
  budgetBytes: number | null
  models: { name: string; verdict: string; evidence: string; floorBytes: number | null }[]
  error: string | null
}

async function run(): Promise<FitCheck> {
  const execution = memoryMode === 'lean' ? 'sequential' : 'concurrent'
  const base: FitCheck = { memoryMode, execution, totalBytes: null, cores: null, cpu: null, gpus: 0, verdict: 'error', basis: null, budgetBytes: null, models: [], error: null }
  try {
    const sys = (await getSystemResources()) as unknown as {
      capabilities: { cpu: Metric<{ name: Metric<string>; logicalCores: Metric<number> }>; memory: { totalBytes: Metric<number> }; gpus: Metric<unknown[]> }
    }
    const cpu = val(sys.capabilities.cpu)
    base.totalBytes = val(sys.capabilities.memory.totalBytes)
    base.cpu = val(cpu?.name)
    base.cores = val(cpu?.logicalCores)
    base.gpus = val(sys.capabilities.gpus)?.length ?? 0
    const fit = (await assessModelFit({ models: fitCandidates(), execution, policy: 'interactive-v1' } as never)) as unknown as {
      verdict: FitCheck['verdict']
      basis: string
      budget?: { availableAfterReserveBytes: number }
      models: { name: string; verdict: string; evidence: string; floorBytes?: number }[]
    }
    return {
      ...base,
      verdict: fit.verdict,
      basis: fit.basis,
      budgetBytes: fit.budget?.availableAfterReserveBytes ?? null,
      models: fit.models.map((m) => ({ name: m.name, verdict: m.verdict, evidence: m.evidence, floorBytes: m.floorBytes ?? null })),
    }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

let check: Promise<FitCheck> | null = null
export const fitCheck = () =>
  (check ??= run().then((r) => {
    if (r.error) check = null
    return r
  }))

// Memory used by the QVAC worker process right now, from QVAC itself.
let workerBytes: number | null = null
let sampling = false
export function qvacMemory() {
  if (!sampling) {
    sampling = true
    const t = setTimeout(() => (sampling = false), 3000)
    getSystemResources({ sample: true } as never)
      .then((r) => {
        const s = (r as unknown as { sample?: { memory?: { processUsedBytes?: Metric<number> } } }).sample
        workerBytes = val(s?.memory?.processUsedBytes) ?? workerBytes
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(t)
        sampling = false
      })
  }
  return workerBytes
}
