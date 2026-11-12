// Lightweight fuzzy matcher tuned for short labels (titles, hosts, commands).

export function fuzzyScore(query, text) {
  const q = String(query || "").toLowerCase().trim();
  const t = String(text || "").toLowerCase();
  if (!q) return 1;
  if (!t) return -Infinity;

  const direct = t.indexOf(q);
  if (direct !== -1) {
    let score = 100 - Math.min(direct, 40);
    if (direct === 0) score += 60;
    else if (/[\s\-_./:]/.test(t[direct - 1])) score += 35;
    score += Math.max(0, 20 - (t.length - q.length) / 4);
    return score;
  }

  // Every query word must appear somewhere.
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let total = 0;
    for (const w of words) {
      const s = fuzzyScore(w, t);
      if (s === -Infinity) return -Infinity;
      total += s;
    }
    return total / words.length - 10;
  }

  // Subsequence match with bonuses for word starts and runs.
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -Infinity;
    const gap = found - ti;
    run = gap === 0 ? run + 1 : 0;
    score += 4 + run * 3 - Math.min(gap, 6);
    if (found === 0 || /[\s\-_./:]/.test(t[found - 1])) score += 6;
    ti = found + 1;
  }
  return score < q.length * 2 ? -Infinity : score;
}

/** Best score across several fields with optional weights. */
export function bestScore(query, fields) {
  let best = -Infinity;
  for (const [text, weight = 1] of fields) {
    const s = fuzzyScore(query, text);
    if (s !== -Infinity) best = Math.max(best, s * weight);
  }
  return best;
}
