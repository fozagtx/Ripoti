import { swahiliNumeralsToDigits } from './swnum.ts'
import type { VisitForm } from './types.ts'

function numbersIn(note: string) {
  return new Set((swahiliNumeralsToDigits(note).match(/\d+/g) ?? []).map(Number))
}

export function groundForm(form: VisitForm, note: string): VisitForm {
  const nums = numbersIn(note)
  const stated = (n: number | null) => n !== null && nums.has(n)
  return {
    ...form,
    members: form.members.map((m) => ({
      ...m,
      ageMonths: m.ageMonths !== null && (stated(m.ageMonths) || (m.ageMonths % 12 === 0 && stated(m.ageMonths / 12))) ? m.ageMonths : null,
    })),
    gestationMonths: form.pregnant && form.gestationMonths !== null && form.gestationMonths >= 1 && form.gestationMonths <= 10 && stated(form.gestationMonths) ? form.gestationMonths : null,
  }
}
