/**
 * Evidence verification: every quote attributed to the advertisement must be
 * locatable in the text we actually analysed. Matching tolerates differences
 * in whitespace, letter case and typographic quotes/dashes, then returns the
 * EXACT original substring so the UI can highlight it verbatim.
 */

const CHAR_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
  "…": "...",
};

interface NormalizedText {
  value: string;
  /** map[i] = index in the original string of normalized char i */
  map: number[];
}

function normalizeWithMap(input: string): NormalizedText {
  let value = "";
  const map: number[] = [];
  let lastWasSpace = true; // trims leading whitespace

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (/\s/.test(ch) || ch === " ") {
      if (!lastWasSpace) {
        value += " ";
        map.push(i);
        lastWasSpace = true;
      }
      continue;
    }
    const mapped = (CHAR_MAP[ch] ?? ch).normalize("NFKC").toLowerCase();
    for (const out of mapped) {
      value += out;
      map.push(i);
    }
    lastWasSpace = false;
  }
  // trim trailing space
  if (value.endsWith(" ")) {
    value = value.slice(0, -1);
    map.pop();
  }
  return { value, map };
}

export function normalizeForMatch(input: string): string {
  return normalizeWithMap(input).value;
}

const MIN_QUOTE_CHARS = 6;

function stripWrapping(quote: string): string {
  return quote
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/^(?:\.\.\.|…)\s*|\s*(?:\.\.\.|…)$/g, "")
    .trim();
}

export interface QuoteMatch {
  start: number;
  end: number;
  /** Exact substring of the source text */
  exact: string;
}

function locate(source: NormalizedText, original: string, quote: string): QuoteMatch | null {
  const needle = normalizeForMatch(quote);
  if (needle.length < MIN_QUOTE_CHARS) return null;
  const idx = source.value.indexOf(needle);
  if (idx === -1) return null;
  const start = source.map[idx];
  const endIdx = source.map[idx + needle.length - 1];
  if (start === undefined || endIdx === undefined) return null;
  const end = endIdx + 1;
  return { start, end, exact: original.slice(start, end) };
}

/**
 * Find a quote inside `text`. If the model elided part of a quote with an
 * ellipsis, fall back to the longest contiguous segment (>= 12 chars).
 */
export function findQuote(text: string, quote: string): QuoteMatch | null {
  const cleaned = stripWrapping(quote);
  if (!cleaned) return null;
  const source = normalizeWithMap(text);

  const direct = locate(source, text, cleaned);
  if (direct) return direct;

  if (/\.\.\.|…/.test(cleaned)) {
    const segments = cleaned
      .split(/\s*(?:\.\.\.|…)\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12)
      .sort((a, b) => b.length - a.length);
    for (const seg of segments) {
      const m = locate(source, text, seg);
      if (m) return m;
    }
  }
  return null;
}

export function quoteExists(text: string, quote: string): boolean {
  return findQuote(text, quote) !== null;
}

/** Expand a match to the surrounding sentence (bounded) to make a readable excerpt. */
export function sentenceAround(text: string, start: number, end: number, maxLen = 240): { start: number; end: number } {
  const boundary = /[.!?\n]/;
  let s = start;
  while (s > 0 && !boundary.test(text[s - 1] as string) && start - s < maxLen) s--;
  let e = end;
  while (e < text.length && !boundary.test(text[e] as string) && e - end < maxLen) e++;
  if (e < text.length && /[.!?]/.test(text[e] as string)) e++;
  // trim whitespace
  while (s < e && /\s/.test(text[s] as string)) s++;
  while (e > s && /\s/.test(text[e - 1] as string)) e--;
  if (e - s > maxLen) {
    // center on the match
    const mid = Math.floor((start + end) / 2);
    s = Math.max(s, mid - Math.floor(maxLen / 2));
    e = Math.min(e, s + maxLen);
    if (s > start) s = start;
    if (e < end) e = end;
  }
  return { start: s, end: e };
}

export interface HighlightRange {
  start: number;
  end: number;
  severity: string;
  ids: string[];
}

/** Compute non-overlapping highlight ranges for a list of exact quotes. */
export function computeHighlights(
  text: string,
  items: { id: string; quote: string; severity: string }[],
): HighlightRange[] {
  const order = ["low", "medium", "high", "critical"];
  const raw: HighlightRange[] = [];
  for (const item of items) {
    if (!item.quote) continue;
    const m = findQuote(text, item.quote);
    if (m) raw.push({ start: m.start, end: m.end, severity: item.severity, ids: [item.id] });
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: HighlightRange[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      if (order.indexOf(r.severity) > order.indexOf(last.severity)) last.severity = r.severity;
      last.ids.push(...r.ids);
    } else {
      merged.push({ ...r, ids: [...r.ids] });
    }
  }
  return merged;
}
