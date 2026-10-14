import { Fraction } from "./fraction.ts";
import { lex, applyCorrections } from "./expressionParser.ts";
import { tokenizeWords } from "./numberWords.ts";

export interface Tolerance {
  /** Absolute tolerance; null means exact match required. */
  abs: number | null;
}

export const EXACT: Tolerance = { abs: null };
/** Used for decimal / probability / expected-value answers. */
export const DECIMAL_TOL: Tolerance = { abs: 0.005 };

export interface ParsedAnswer {
  value: Fraction;
  /** The answer was phrased as a percentage ("25 percent") and converted to 0.25. */
  wasPercent: boolean;
}

/**
 * Parse a spoken or typed answer into a single number. Accepts "14", "7/8",
 * "0.875", "seven eighths", "negative three", "twelve dollars", "25 percent",
 * "it's 14", "the answer is 14". Returns null if there is not exactly one number.
 */
export function parseAnswer(text: string): ParsedAnswer | null {
  const cleaned = text
    .toLowerCase()
    .replace(/\b(dollars?|bucks|cents?|usd)\b/g, " ")
    .replace(/\b(it'?s|its|the answer is|answer|is|equals|about|approximately|roughly|around|i think|maybe|probably|um|uh)\b/g, " ");
  const words = tokenizeWords(cleaned);
  if (words.length === 0) return null;
  const { tokens: raw } = lex(cleaned);
  const tokens = applyCorrections(raw);
  const nums = tokens.filter((t) => t.t === "num");
  if (nums.length === 0) return null;

  // Allow a leading unary minus and a trailing percent; anything else is ambiguous.
  let i = 0;
  let sign = 1;
  if (tokens[i]?.t === "op" && (tokens[i] as { v: string }).v === "-") {
    sign = -1;
    i++;
  }
  const numTok = tokens[i];
  if (!numTok || numTok.t !== "num") return null;
  i++;
  let wasPercent = false;
  if (tokens[i]?.t === "percent") {
    wasPercent = true;
    i++;
  }
  if (i !== tokens.length) {
    // e.g. "seven over eight" lexes as 7 ÷ 8 — allow a simple a/b form
    if (tokens.length - i === 2 && tokens[i].t === "op" && (tokens[i] as { v: string }).v === "/" && tokens[i + 1].t === "num") {
      const den = (tokens[i + 1] as { v: Fraction }).v;
      if (den.isZero()) return null;
      return { value: numTok.v.div(den).mul(Fraction.fromInt(sign)), wasPercent: false };
    }
    return null;
  }
  let value = numTok.v;
  if (wasPercent) value = value.div(Fraction.fromInt(100));
  if (sign < 0) value = value.neg();
  return { value, wasPercent };
}

export type CheckResult = { correct: true; parsed: Fraction } | { correct: false; parsed: Fraction | null };

export function checkAnswer(expected: Fraction, given: string, tolerance: Tolerance, opts: { acceptPercentForm?: boolean } = {}): CheckResult {
  const parsed = parseAnswer(given);
  if (!parsed) return { correct: false, parsed: null };
  const candidates = [parsed.value];
  // "25 percent" for an expected 1/4 is converted already; also accept "25" for 0.25 if allowed.
  if (opts.acceptPercentForm && !parsed.wasPercent) candidates.push(parsed.value.div(Fraction.fromInt(100)));
  for (const c of candidates) {
    if (c.equals(expected)) return { correct: true, parsed: c };
    if (tolerance.abs !== null && Math.abs(c.toNumber() - expected.toNumber()) <= tolerance.abs) {
      return { correct: true, parsed: c };
    }
  }
  return { correct: false, parsed: parsed.value };
}
