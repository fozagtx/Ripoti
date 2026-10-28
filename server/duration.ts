// How long an illness has lasted, in days, from a note sentence that has
// already been through swahiliNumeralsToDigits. Month counts only count
// after "kwa"/"tangu" ("for"/"since") so ages ("mtoto wa miezi 8") are ignored.
const PATTERNS: [RegExp, (n: number) => number][] = [
  [/\b(?:siku|days?)\s+(\d+)\b|\b(\d+)\s+days?\b/gi, (n) => n],
  [/\b(?:wiki)\s+(\d+)\b|\b(\d+)\s+weeks?\b/gi, (n) => n * 7],
  [/\b(?:kwa|tangu)\s+(?:mwezi|miezi)\s+(\d+)\b|\bfor\s+(\d+)\s+months?\b/gi, (n) => n * 30],
]
const WORDS: [RegExp, number][] = [
  [/\b(?:tangu|since)\s+(?:jana|yesterday)\b/i, 1],
  [/\b(?:tangu|since)\s+juzi\b/i, 2],
  [/\b(?:tangu\s+)?wiki\s+iliyopita\b|\bsince\s+last\s+week\b/i, 7],
  [/\b(?:tangu\s+)?mwezi\s+uliopita\b|\bsince\s+last\s+month\b/i, 30],
  [/\bleo\b|\btoday\b/i, 0],
]

export function statedDays(sentence: string): number | null {
  const found: number[] = []
  for (const [re, toDays] of PATTERNS) for (const m of sentence.matchAll(re)) found.push(toDays(Number(m[1] ?? m[2])))
  for (const [re, days] of WORDS) if (re.test(sentence)) found.push(days)
  return found.length ? Math.max(...found) : null
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

// The note sentence that shares the most words with a quoted piece of evidence.
export function sentenceOf(evidence: string, note: string): string {
  const ev = new Set(words(evidence))
  let best = evidence
  let score = 0
  for (const s of note.split(/(?<=[.!?])\s+/)) {
    const n = words(s).filter((w) => ev.has(w)).length
    if (n > score) [best, score] = [s, n]
  }
  return best
}
