import type { DangerResult, VisitForm } from './types.ts'

export function readbackText(form: VisitForm, danger: DangerResult[]): string {
  const flagged = danger.filter((d) => d.flagged)
  const parts = [`Kaya ${form.householdId || 'bila namba'}.`]
  if (flagged.length) {
    parts.push(`Dalili za hatari: ${flagged.map((d) => d.labelSw).join(', ')}.`)
    parts.push('Mpe rufaa kwenda kituo cha afya leo.')
  } else {
    parts.push('Hakuna dalili za hatari zilizotambuliwa.')
  }
  if (form.pregnant) parts.push(form.gestationMonths ? `Mama ni mjamzito wa miezi ${form.gestationMonths}.` : 'Mama ni mjamzito.')
  return parts.join(' ')
}
