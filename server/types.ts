export interface Member {
  role: string
  ageMonths: number | null
  symptoms: string[]
}

export interface VisitForm {
  householdId: string
  members: Member[]
  pregnant: boolean
  gestationMonths: number | null
  vaccinesUpToDate: boolean | null
  referralGiven: boolean
  followUp: string
  summary: string
}

export interface DangerResult {
  id: string
  label: string
  labelSw: string
  evidence: string
  support: number
  flagged: boolean
}

export interface StageTiming {
  stage: 'normalise' | 'transcribe' | 'extract' | 'danger'
  ms: number
}

export interface Visit {
  id: string
  createdAt: string
  updatedAt: string
  device: string
  language: 'sw' | 'en'
  transcript: string
  form: VisitForm
  danger: DangerResult[]
  urgent: boolean
  readback: string
  timings: StageTiming[]
  models: Record<string, string>
}

export const VISIT_SCHEMA = {
  type: 'object',
  properties: {
    householdId: { type: 'string', description: 'Household number as spoken, digits only, e.g. 0142. Empty if not said.' },
    members: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'mother, child, newborn, father, elder, other' },
          ageMonths: { type: ['integer', 'null'] },
          symptoms: { type: 'array', items: { type: 'string' }, description: 'Symptoms in English' },
        },
        required: ['role', 'ageMonths', 'symptoms'],
      },
    },
    pregnant: { type: 'boolean' },
    gestationMonths: { type: ['integer', 'null'] },
    vaccinesUpToDate: { type: ['boolean', 'null'] },
    referralGiven: { type: 'boolean' },
    followUp: { type: 'string', description: 'Follow-up action, empty if none' },
    summary: { type: 'string', description: 'One-sentence English summary' },
  },
  required: ['householdId', 'members', 'pregnant', 'gestationMonths', 'vaccinesUpToDate', 'referralGiven', 'followUp', 'summary'],
} as const
