import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groundForm } from './ground.ts'

const base = { householdId: '0142', pregnant: true, vaccinesUpToDate: null, referralGiven: false, followUp: '', summary: '' }

test('drops ages and gestation that the note never states', () => {
  const note = 'Kaya namba 0142. Mtoto wa miezi nane ana homa. Mama ni mjamzito wa miezi saba.'
  const f = groundForm({ ...base, gestationMonths: 38, members: [{ role: 'child', ageMonths: 8, symptoms: [] }, { role: 'mother', ageMonths: 456, symptoms: [] }] }, note)
  assert.equal(f.members[0].ageMonths, 8)
  assert.equal(f.members[1].ageMonths, null)
  assert.equal(f.gestationMonths, null)
  assert.equal(groundForm({ ...base, gestationMonths: 7, members: [] }, note).gestationMonths, 7)
})

test('keeps ages stated in years', () => {
  const f = groundForm({ ...base, pregnant: false, gestationMonths: null, members: [{ role: 'child', ageMonths: 36, symptoms: [] }] }, 'Mtoto wa miaka mitatu ana kikohozi.')
  assert.equal(f.members[0].ageMonths, 36)
})
