import { Fraction } from "./fraction.ts";

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, nought: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const FRACTION_WORDS: Record<string, number> = {
  half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4,
  fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, seventh: 7, sevenths: 7,
  eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10, twelfth: 12,
  twelfths: 12, sixteenth: 16, sixteenths: 16, twentieth: 20, twentieths: 20,
  hundredth: 100, hundredths: 100,
};

export const NUMERIC_TOKEN = /^-?\d+(?:\.\d+)?(?:\/\d+)?$/;

export interface NumberMatch {
  value: Fraction;
  next: number;
}

/** Normalise text into word tokens. Keeps digit literals like 17.5 or 3/4 intact. */
export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[$£€]/g, " ")
    .replace(/%/g, " percent ")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[−–]/g, "-")
    .replace(/(?<=[a-z])-(?=[a-z])/g, " ")
    .replace(/(\d)-(\d)/g, "$1 - $2")
    .replace(/(?<=\s|^)-(?=\s|$)/g, " - ")
    .replace(/[,;:!?"']/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseSmall(words: string[], i: number): { value: number; next: number } | null {
  // 0..99
  const w = words[i];
  if (w === undefined) return null;
  if (w in TENS) {
    const t = TENS[w];
    const u = words[i + 1];
    if (u !== undefined && u in UNITS && UNITS[u] < 10 && UNITS[u] > 0) {
      return { value: t + UNITS[u], next: i + 2 };
    }
    return { value: t, next: i + 1 };
  }
  if (w in UNITS) return { value: UNITS[w], next: i + 1 };
  return null;
}

/** Parse whole-number words: "one hundred and twenty", "a hundred", "two thousand five". */
function parseWholeWords(words: string[], i: number): { value: number; next: number } | null {
  let pos = i;
  let total = 0;
  let current = 0;
  let consumed = false;

  const isArticle = (w: string | undefined) => w === "a" || w === "an";

  if (isArticle(words[pos]) && (words[pos + 1] === "hundred" || words[pos + 1] === "thousand")) {
    current = 1;
    pos += 1;
    consumed = true;
  } else {
    const s = parseSmall(words, pos);
    if (s) {
      current = s.value;
      pos = s.next;
      consumed = true;
    }
  }

  if (words[pos] === "hundred") {
    current = (current || 1) * 100;
    pos += 1;
    consumed = true;
    let p = pos;
    if (words[p] === "and") p += 1;
    const s = parseSmall(words, p);
    if (s) {
      current += s.value;
      pos = s.next;
    }
  }

  if (words[pos] === "thousand") {
    total += (current || 1) * 1000;
    current = 0;
    pos += 1;
    consumed = true;
    let p = pos;
    if (words[p] === "and") p += 1;
    const rest = parseHundredsOrSmall(words, p);
    if (rest) {
      current = rest.value;
      pos = rest.next;
    }
  }

  if (!consumed) return null;
  return { value: total + current, next: pos };
}

function parseHundredsOrSmall(words: string[], i: number): { value: number; next: number } | null {
  let pos = i;
  let current = 0;
  const s = parseSmall(words, pos);
  if (s) {
    current = s.value;
    pos = s.next;
  } else if ((words[pos] === "a" || words[pos] === "an") && words[pos + 1] === "hundred") {
    current = 1;
    pos += 1;
  } else {
    return null;
  }
  if (words[pos] === "hundred") {
    current *= 100;
    pos += 1;
    let p = pos;
    if (words[p] === "and") p += 1;
    const s2 = parseSmall(words, p);
    if (s2) {
      current += s2.value;
      pos = s2.next;
    }
  }
  return { value: current, next: pos };
}

/** After the word "point": digits spoken one at a time, or a tens/teens word. */
function parseDecimalTail(words: string[], i: number): { digits: string; next: number } | null {
  let pos = i;
  let digits = "";
  while (pos < words.length) {
    const w = words[pos];
    if (/^\d+$/.test(w)) {
      digits += w;
      pos++;
    } else if (w in UNITS) {
      digits += String(UNITS[w]);
      pos++;
    } else if (w in TENS) {
      const u = words[pos + 1];
      if (u !== undefined && u in UNITS && UNITS[u] > 0 && UNITS[u] < 10) {
        digits += String(TENS[w] + UNITS[u]);
        pos += 2;
      } else {
        digits += String(TENS[w]);
        pos++;
      }
    } else break;
  }
  return digits ? { digits, next: pos } : null;
}

/**
 * Parse a number phrase starting at index i. Handles digit literals, number
 * words, decimals ("fourteen point five"), fraction words ("three quarters",
 * "a half", "one eighth") and mixed numbers ("two and a half").
 */
export function parseNumberPhrase(words: string[], i: number): NumberMatch | null {
  const w = words[i];
  if (w === undefined) return null;

  // Digit literal
  if (NUMERIC_TOKEN.test(w)) {
    const v = Fraction.parse(w);
    if (!v) return null;
    return withFractionTail(words, i + 1, v, v.isInteger());
  }

  // Bare fraction words: "half", "a half", "a quarter", "one eighth"
  if (w in FRACTION_WORDS) {
    return { value: new Fraction(1, FRACTION_WORDS[w]), next: i + 1 };
  }
  if ((w === "a" || w === "an") && words[i + 1] !== undefined && words[i + 1] in FRACTION_WORDS) {
    return { value: new Fraction(1, FRACTION_WORDS[words[i + 1]]), next: i + 2 };
  }

  const whole = parseWholeWords(words, i);
  if (!whole) return null;
  let pos = whole.next;
  let value = Fraction.fromInt(whole.value);

  // Decimal: "point five"
  if (words[pos] === "point") {
    const tail = parseDecimalTail(words, pos + 1);
    if (!tail) return { value, next: pos }; // "fourteen point" cut off: leave "point" dangling
    value = Fraction.parse(`${whole.value}.${tail.digits}`)!;
    return { value, next: tail.next };
  }

  return withFractionTail(words, pos, value, true);
}

/** "three quarters" -> 3/4 ; "two and a half" -> 5/2 ; "two and three quarters" -> 11/4 */
function withFractionTail(words: string[], pos: number, value: Fraction, allowFraction: boolean): NumberMatch {
  if (!allowFraction) return { value, next: pos };
  const w = words[pos];
  if (w !== undefined && w in FRACTION_WORDS && value.isInteger()) {
    // "three quarters" (numerator then fraction word)
    return { value: value.div(Fraction.fromInt(FRACTION_WORDS[w])), next: pos + 1 };
  }
  if (w === "and") {
    // mixed number: "two and a half", "one and three quarters"
    let p = pos + 1;
    let numer = 1;
    if (words[p] === "a" || words[p] === "an") {
      p += 1;
    } else {
      const s = parseSmall(words, p);
      if (s && words[s.next] !== undefined && words[s.next] in FRACTION_WORDS) {
        numer = s.value;
        p = s.next;
      } else {
        return { value, next: pos };
      }
    }
    const fw = words[p];
    if (fw !== undefined && fw in FRACTION_WORDS) {
      return { value: value.add(new Fraction(numer, FRACTION_WORDS[fw])), next: p + 1 };
    }
  }
  return { value, next: pos };
}

/** Convenience: parse a whole string that should be a single number. */
export function wordsToNumber(text: string): Fraction | null {
  const words = tokenizeWords(text);
  const m = parseNumberPhrase(words, 0);
  if (!m || m.next !== words.length) return null;
  return m.value;
}

export function isNumberWord(w: string): boolean {
  return w in UNITS || w in TENS || w in FRACTION_WORDS || w === "hundred" || w === "thousand" || NUMERIC_TOKEN.test(w);
}
