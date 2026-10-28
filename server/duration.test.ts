import { test } from 'node:test'
import assert from 'node:assert/strict'
import { durationEvidence, sentenceOf, statedDays } from './duration.ts'
import { swahiliNumeralsToDigits as sw } from './swnum.ts'

test('reads illness duration and ignores ages', () => {
  assert.equal(statedDays(sw('Mtoto wa miezi nane ana homa kali tangu jana na hawezi kunyonya.')), 1)
  assert.equal(statedDays(sw('Ana homa tangu juzi.')), 2)
  assert.equal(statedDays(sw('Babu ana kikohozi kwa wiki tatu na anapungua uzito.')), 21)
  assert.equal(statedDays(sw('Mtoto ana homa kwa siku nane.')), 8)
  assert.equal(statedDays('The child has had a cough for 3 weeks.'), 21)
  assert.equal(statedDays(sw('Mtoto wa miezi tisa anapumua kwa haraka.')), null)
})

test('finds the sentence a quote came from', () => {
  const note = 'Kaya namba 1107. Mtoto wa miezi 9 anapumua kwa haraka. Ana homa tangu juzi.'
  assert.equal(sentenceOf('homa tangu juzi', note), 'Ana homa tangu juzi.')
})

test('finds a stated long duration for the symptom, ignoring negation', () => {
  const fever = /\b(homa|fever)\b/i
  assert.equal(durationEvidence(fever, 7, sw('Mtoto wa miaka mitatu ana homa kwa siku kumi sasa. Bado anakula vizuri.')), 'Mtoto wa miaka 3 ana homa kwa siku 10 sasa.')
  assert.equal(durationEvidence(fever, 7, sw('Mtoto wa miezi sita ana homa kwa siku tatu.')), null)
  assert.equal(durationEvidence(fever, 7, sw('Ana kikohozi kwa siku kumi. Hana homa.')), null)
  assert.equal(durationEvidence(/\b(kikohozi|cough)\b/i, 14, sw('Babu ana kikohozi kwa wiki tatu.')), 'Babu ana kikohozi kwa wiki 3.')
})
