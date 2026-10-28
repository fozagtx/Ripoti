const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)

function edits(a: string[], b: string[]) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function wer(ref: string, hyp: string) {
  const r = norm(ref)
  return { errors: edits(r, norm(hyp)), words: r.length }
}

export function cer(ref: string, hyp: string) {
  const r = [...norm(ref).join(' ')]
  return { errors: edits(r, [...norm(hyp).join(' ')]), chars: r.length }
}
