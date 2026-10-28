import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wer } from './wer.ts'

test('word error rate counts substitutions, insertions and deletions', () => {
  assert.deepEqual(wer('mtoto ana homa kali', 'mtoto ana homa kali'), { errors: 0, words: 4 })
  assert.deepEqual(wer('mtoto ana homa kali', 'mtoto na homa'), { errors: 2, words: 4 })
  assert.deepEqual(wer('Mtoto, ana homa.', 'mtoto ana homa'), { errors: 0, words: 3 })
})
