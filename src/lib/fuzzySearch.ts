/**
 * Persian & English Fuzzy Search Engine for Holoo Apex Data Tables.
 * Supports:
 * - Persian/Arabic digit normalization (۰-۹, ٠-٩ -> 0-9)
 * - Arabic/Persian character canonicalization (ي/ی, ك/ک, أ/إ/آ -> ا, ة -> ه, ZWNJ)
 * - Multi-token out-of-order matching ("فروش ملت 1404")
 * - Ordered character subsequence matching ("فرش" -> "فروش", "140410" -> "F-1404-101")
 * - Typo-tolerant Damerau-Levenshtein matching ("فروس" -> "فروش", "فاکتو" -> "فاکتور")
 * - Highlight segment extraction on original un-normalized strings
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeFuzzyChar(ch: string): string {
  const pIdx = PERSIAN_DIGITS.indexOf(ch);
  if (pIdx !== -1) return String(pIdx);
  const aIdx = ARABIC_DIGITS.indexOf(ch);
  if (aIdx !== -1) return String(aIdx);
  switch (ch) {
    case 'ي':
    case 'ى':
    case 'ئ':
      return 'ی';
    case 'ك':
      return 'ک';
    case 'أ':
    case 'إ':
    case 'آ':
      return 'ا';
    case 'ة':
      return 'ه';
    case 'ؤ':
      return 'و';
    case '\u200c':
      return ' ';
    default:
      return ch.toLowerCase();
  }
}

export function normalizeFuzzyText(input: string): string {
  if (!input) return '';
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Strip Arabic diacritics & tatweel
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640) {
      continue;
    }
    out += normalizeFuzzyChar(input[i]);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Compact alphanumeric/Persian form without separators (-, /, _, space, #) for IDs/codes */
function stripSeparators(text: string): string {
  return text.replace(/[\s\-_/#.,،·()]/g, '');
}

/** Fast bounded Damerau-Levenshtein distance with early exit */
function boundedEditDistance(a: string, b: string, maxDist: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const d: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d[i - 2][j - 2] + 1);
      }
      d[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return d[la][lb];
}

export type FuzzyMatchKind = 'exact' | 'prefix' | 'substring' | 'subsequence' | 'typo' | 'none';

export interface TokenScoreResult {
  score: number;
  kind: FuzzyMatchKind;
}

/**
 * Scores how well a single normalized query token matches a single normalized target string.
 * Returns score 0..100 and match kind.
 */
export function fuzzyScoreToken(token: string, rawTarget: string): TokenScoreResult {
  if (!token || !rawTarget) return { score: 0, kind: 'none' };

  const target = normalizeFuzzyText(rawTarget);
  if (!target) return { score: 0, kind: 'none' };

  // 1. Exact full match
  if (target === token) return { score: 100, kind: 'exact' };

  // 2. Direct prefix match
  if (target.startsWith(token)) return { score: 94, kind: 'prefix' };

  // 3. Word-boundary prefix match
  const words = target.split(/[\s\-_/#.,،·()]+/).filter(Boolean);
  for (const w of words) {
    if (w === token) return { score: 91, kind: 'exact' };
    if (w.startsWith(token)) return { score: 86, kind: 'prefix' };
  }

  // 4. Contiguous substring match
  const subIdx = target.indexOf(token);
  if (subIdx !== -1) {
    const posBonus = Math.max(0, 6 - Math.floor(subIdx / 6));
    return { score: 74 + posBonus, kind: 'substring' };
  }

  // 5. Separator-stripped match (great for invoice numbers like F-1404-101 or Sayadi IDs / dates)
  const compactToken = stripSeparators(token);
  const compactTarget = stripSeparators(target);
  if (compactToken.length >= 2 && compactTarget.includes(compactToken)) {
    const isPrefix = compactTarget.startsWith(compactToken);
    return { score: isPrefix ? 88 : 75, kind: isPrefix ? 'prefix' : 'substring' };
  }

  // 6. Ordered character subsequence fuzzy match (e.g. "فرش" -> "فروش", "چص" -> "چک صیادی")
  if (compactToken.length >= 2 && compactTarget.length >= compactToken.length) {
    let ti = 0;
    let consecutive = 0;
    let maxConsecutive = 0;
    let firstIdx = -1;
    let lastIdx = -1;
    for (let i = 0; i < compactTarget.length && ti < compactToken.length; i++) {
      if (compactTarget[i] === compactToken[ti]) {
        if (firstIdx === -1) firstIdx = i;
        if (lastIdx === i - 1) {
          consecutive += 1;
          if (consecutive > maxConsecutive) maxConsecutive = consecutive;
        } else {
          consecutive = 1;
        }
        lastIdx = i;
        ti += 1;
      }
    }
    if (ti === compactToken.length) {
      const span = lastIdx - firstIdx + 1;
      const density = compactToken.length / span; // 1.0 = tight, lower = spread out
      if (density >= 0.42 || compactToken.length >= 3) {
        const score = Math.round(52 + density * 16 + Math.min(6, maxConsecutive * 2));
        return { score: Math.min(72, score), kind: 'subsequence' };
      }
    }
  }

  // 7. Typo-tolerant edit distance against individual words (for tokens length >= 3)
  if (token.length >= 3) {
    const maxDist = token.length >= 6 ? 2 : 1;
    let bestDist = maxDist + 1;
    for (const w of words) {
      if (w.length < 2) continue;
      // Also allow prefix-typo match (typing first N chars with 1 typo of a longer word)
      const sliceLen = Math.min(w.length, token.length + maxDist);
      const candidate = w.slice(0, sliceLen);
      const dist = Math.min(
        boundedEditDistance(token, w, maxDist),
        boundedEditDistance(token, candidate, maxDist)
      );
      if (dist < bestDist) bestDist = dist;
      if (bestDist === 1) break;
    }
    if (bestDist <= maxDist) {
      return { score: bestDist === 1 ? 54 : 44, kind: 'typo' };
    }
  }

  return { score: 0, kind: 'none' };
}

export interface FuzzyField {
  text: string | number | undefined | null;
  weight?: number;
}

export interface FuzzyScoreResult {
  score: number;
  isFuzzy: boolean;
  kind: FuzzyMatchKind;
}

/**
 * Evaluates a multi-token query across weighted record fields.
 * Every space-separated token must match at least one field.
 */
export function fuzzyScoreFields(query: string, fields: FuzzyField[]): FuzzyScoreResult {
  const normQuery = normalizeFuzzyText(query);
  if (!normQuery) return { score: 100, isFuzzy: false, kind: 'exact' };

  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return { score: 100, isFuzzy: false, kind: 'exact' };

  const nonEmptyFields = fields
    .map((f) => ({
      text: f.text === null || f.text === undefined ? '' : String(f.text),
      weight: f.weight ?? 1,
    }))
    .filter((f) => f.text.length > 0);

  if (nonEmptyFields.length === 0) return { score: 0, isFuzzy: false, kind: 'none' };

  let totalScore = 0;
  let usedFuzzy = false;
  let worstKind: FuzzyMatchKind = 'exact';
  const kindOrder: Record<FuzzyMatchKind, number> = {
    exact: 5,
    prefix: 4,
    substring: 3,
    subsequence: 2,
    typo: 1,
    none: 0,
  };

  for (const token of tokens) {
    let bestTokenWeighted = 0;
    let bestTokenRaw = 0;
    let bestKind: FuzzyMatchKind = 'none';

    for (const field of nonEmptyFields) {
      const res = fuzzyScoreToken(token, field.text);
      if (res.score > 0) {
        const weighted = res.score * field.weight;
        if (weighted > bestTokenWeighted) {
          bestTokenWeighted = weighted;
          bestTokenRaw = res.score;
          bestKind = res.kind;
        }
      }
    }

    if (bestTokenRaw === 0) {
      return { score: 0, isFuzzy: false, kind: 'none' };
    }

    if (bestKind === 'subsequence' || bestKind === 'typo') {
      usedFuzzy = true;
    }
    if (kindOrder[bestKind] < kindOrder[worstKind]) {
      worstKind = bestKind;
    }
    totalScore += bestTokenWeighted;
  }

  return {
    score: Math.round(totalScore / tokens.length),
    isFuzzy: usedFuzzy,
    kind: worstKind,
  };
}

export interface RankedFuzzyItem<T> {
  item: T;
  score: number;
  isFuzzy: boolean;
  kind: FuzzyMatchKind;
}

/**
 * Instant fuzzy filtering and relevance ranking for any data table array.
 */
export function fuzzyFilterAndRank<T>(
  records: T[],
  query: string,
  getFields: (item: T) => FuzzyField[]
): RankedFuzzyItem<T>[] {
  const norm = normalizeFuzzyText(query);
  if (!norm) {
    return records.map((item) => ({ item, score: 100, isFuzzy: false, kind: 'exact' }));
  }

  const ranked: RankedFuzzyItem<T>[] = [];
  for (const item of records) {
    const res = fuzzyScoreFields(norm, getFields(item));
    if (res.score > 0) {
      ranked.push({ item, score: res.score, isFuzzy: res.isFuzzy, kind: res.kind });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Returns highlighted segments on the original (un-normalized) string
 * matching contiguous substrings OR fuzzy ordered character subsequences.
 */
export function getHighlightSegments(originalText: string, query: string): HighlightSegment[] {
  if (!originalText) return [];
  const normQuery = normalizeFuzzyText(query);
  if (!normQuery) return [{ text: originalText, match: false }];

  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return [{ text: originalText, match: false }];

  // Build normalized char array with 1-to-1 index mapping back to originalText
  const normChars: string[] = [];
  const origIdxMap: number[] = [];
  for (let i = 0; i < originalText.length; i++) {
    const code = originalText.charCodeAt(i);
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640) continue;
    normChars.push(normalizeFuzzyChar(originalText[i]));
    origIdxMap.push(i);
  }
  const normStr = normChars.join('');
  const matchedOrig = new Array<boolean>(originalText.length).fill(false);

  for (const token of tokens) {
    // 1. Prefer exact contiguous substring highlight
    const idx = normStr.indexOf(token);
    if (idx !== -1) {
      for (let k = idx; k < idx + token.length; k++) {
        matchedOrig[origIdxMap[k]] = true;
      }
      continue;
    }

    // 2. Fallback: ordered subsequence highlight
    const compactTok = stripSeparators(token);
    if (compactTok.length >= 2) {
      const positions: number[] = [];
      let ti = 0;
      for (let i = 0; i < normChars.length && ti < compactTok.length; i++) {
        if (normChars[i] === compactTok[ti]) {
          positions.push(origIdxMap[i]);
          ti += 1;
        }
      }
      if (ti === compactTok.length) {
        positions.forEach((p) => {
          matchedOrig[p] = true;
        });
      }
    }
  }

  // Group contiguous runs
  const segments: HighlightSegment[] = [];
  let curText = '';
  let curMatch = matchedOrig[0] ?? false;

  for (let i = 0; i < originalText.length; i++) {
    if (matchedOrig[i] === curMatch) {
      curText += originalText[i];
    } else {
      if (curText) segments.push({ text: curText, match: curMatch });
      curText = originalText[i];
      curMatch = matchedOrig[i];
    }
  }
  if (curText) segments.push({ text: curText, match: curMatch });
  return segments;
}
