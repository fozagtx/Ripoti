// Swahili number words -> digits, so the LLM never has to translate
// numerals ("miezi nane" -> "miezi 8"). Covers 0-99, enough for ages,
// months of pregnancy and days of illness.
const UNITS: Record<string, number> = {
  sifuri: 0, moja: 1, mmoja: 1, mbili: 2, wawili: 2, tatu: 3, watatu: 3, nne: 4, wanne: 4,
  tano: 5, watano: 5, sita: 6, saba: 7, nane: 8, wanane: 8, tisa: 9,
  miwili: 2, mitatu: 3, minne: 4, mitano: 5, minane: 8,
}
const TENS: Record<string, number> = {
  kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90,
}

export function swahiliNumeralsToDigits(text: string): string {
  const tens = Object.keys(TENS).join('|')
  const units = Object.keys(UNITS).join('|')
  return text
    .replace(new RegExp(`\\b(${tens})\\s+na\\s+(${units})\\b`, 'gi'), (_, t: string, u: string) => String(TENS[t.toLowerCase()] + UNITS[u.toLowerCase()]))
    .replace(new RegExp(`\\b(${tens})\\b`, 'gi'), (t: string) => String(TENS[t.toLowerCase()]))
    .replace(new RegExp(`\\b(miezi|mwezi|miaka|mwaka|siku|wiki|wiki|watoto|mtoto|namba)\\s+(${units})\\b`, 'gi'), (_, w: string, u: string) => `${w} ${UNITS[u.toLowerCase()]}`)
}

const DIGIT = ['sifuri', 'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa']
const TEN_WORDS = ['', 'kumi', 'ishirini', 'thelathini', 'arobaini', 'hamsini', 'sitini', 'sabini', 'themanini', 'tisini']

// Digits -> Kiswahili words for speech: Chatterbox mumbles raw digits.
// Codes like 0142 are read digit by digit; small counts as numbers.
export function digitsToSwahiliWords(text: string): string {
  return text.replace(/\d+/g, (d) => {
    const n = Number(d)
    if (d.length > 2 || (d.length === 2 && d[0] === '0')) return [...d].map((c) => DIGIT[Number(c)]).join(', ')
    if (n < 10) return DIGIT[n]
    const t = TEN_WORDS[Math.floor(n / 10)]
    return n % 10 ? `${t} na ${DIGIT[n % 10]}` : t
  })
}
