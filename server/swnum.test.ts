import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digitsToSwahiliWords, swahiliNumeralsToDigits } from './swnum.ts'

test('converts Swahili numerals used in visit notes', () => {
  assert.equal(swahiliNumeralsToDigits('Mtoto wa miezi nane'), 'Mtoto wa miezi 8')
  assert.equal(swahiliNumeralsToDigits('mjamzito wa miezi saba'), 'mjamzito wa miezi 7')
  assert.equal(swahiliNumeralsToDigits('ana miaka ishirini na tano'), 'ana miaka 25')
  assert.equal(swahiliNumeralsToDigits('homa kwa siku tatu'), 'homa kwa siku 3')
  assert.equal(swahiliNumeralsToDigits('kikohozi wiki mbili'), 'kikohozi wiki 2')
})

test('leaves unit words alone when not counting', () => {
  assert.equal(swahiliNumeralsToDigits('Mama ana nne'), 'Mama ana nne')
  assert.equal(swahiliNumeralsToDigits('saba'), 'saba')
})

test('speaks digits as Kiswahili words', () => {
  assert.equal(digitsToSwahiliWords('Kaya 0142. Mama ni mjamzito wa miezi 7.'), 'Kaya sifuri moja nne mbili. Mama ni mjamzito wa miezi saba.')
  assert.equal(digitsToSwahiliWords('siku 14, miaka 30'), 'siku kumi na nne, miaka thelathini')
})
