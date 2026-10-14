import { Fraction } from "./fraction.ts";
import { parseNumberPhrase, tokenizeWords } from "./numberWords.ts";

export type Token =
  | { t: "num"; v: Fraction; raw: string; display: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" | "of" }
  | { t: "percent" }
  | { t: "squared" }
  | { t: "cubed" }
  | { t: "sqrt" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "corr" };

export type ParseOutcome =
  | { kind: "ok"; expression: string; value: Fraction; approximate: boolean; ignoredWords: string[] }
  | { kind: "incomplete"; reason: string; expression?: string }
  | { kind: "no_expression" }
  | { kind: "unclear"; reason: string; expression?: string; unknownWords: string[] }
  | { kind: "needs_llm"; cleaned: string; reason: string };

const FILLERS = new Set([
  "okay", "ok", "next", "question", "what", "whats", "is", "equals", "equal", "the", "please",
  "um", "uh", "hmm", "so", "now", "then", "lets", "let", "go", "alright", "right", "tell", "me",
  "calculate", "compute", "answer", "give", "find", "evaluate", "result", "how", "much", "many",
  "does", "do", "you", "get", "when", "if", "we", "i", "take", "quick", "hey", "alexa", "siri",
  "all", "together", "altogether", "total", "would", "be", "it", "that", "this", "first", "second",
]);

const CORRECTIONS = new Set(["sorry", "correction", "actually", "wait", "no", "nope", "rather", "oops"]);
const CORRECTION_PHRASES = [["i", "mean"], ["scratch", "that"], ["make", "that"], ["no", "wait"], ["hang", "on"]];

const LLM_KEYWORDS = [
  "probability", "chance", "chances", "odds", "likely", "expected", "expectation", "dice", "die", "coin",
  "coins", "flip", "flips", "toss", "tosses", "roll", "rolls", "rolled", "bet", "bets", "wager", "card",
  "cards", "deck", "draw", "variance", "deviation", "factorial", "combinations", "permutations", "choose",
  "heads", "tails", "payout", "payoff", "fair", "win", "lose", "random",
];

const OP_PHRASES: Array<[string[], Token]> = [
  [["to", "the", "power", "of"], { t: "op", v: "^" }],
  [["raised", "to"], { t: "op", v: "^" }],
  [["square", "root", "of"], { t: "sqrt" }],
  [["square", "root"], { t: "sqrt" }],
  [["root", "of"], { t: "sqrt" }],
  [["divided", "by"], { t: "op", v: "/" }],
  [["divide", "by"], { t: "op", v: "/" }],
  [["multiplied", "by"], { t: "op", v: "*" }],
  [["multiply", "by"], { t: "op", v: "*" }],
  [["take", "away"], { t: "op", v: "-" }],
  [["added", "to"], { t: "op", v: "+" }],
  [["percent", "of"], { t: "percent" }], // "of" re-added below
  [["percentage", "of"], { t: "percent" }],
  [["open", "bracket"], { t: "lparen" }],
  [["close", "bracket"], { t: "rparen" }],
  [["open", "parenthesis"], { t: "lparen" }],
  [["close", "parenthesis"], { t: "rparen" }],
];

const OP_WORDS: Record<string, Token> = {
  plus: { t: "op", v: "+" },
  add: { t: "op", v: "+" },
  and: { t: "op", v: "+" },
  minus: { t: "op", v: "-" },
  subtract: { t: "op", v: "-" },
  less: { t: "op", v: "-" },
  times: { t: "op", v: "*" },
  x: { t: "op", v: "*" },
  "*": { t: "op", v: "*" },
  "×": { t: "op", v: "*" },
  over: { t: "op", v: "/" },
  "÷": { t: "op", v: "/" },
  "/": { t: "op", v: "/" },
  "+": { t: "op", v: "+" },
  "-": { t: "op", v: "-" },
  "^": { t: "op", v: "^" },
  of: { t: "op", v: "of" },
  percent: { t: "percent" },
  squared: { t: "squared" },
  cubed: { t: "cubed" },
  sqrt: { t: "sqrt" },
  "(": { t: "lparen" },
  ")": { t: "rparen" },
};

export interface LexResult {
  tokens: Token[];
  unknownWords: string[];
  fillerWords: string[];
  /** A number was cut off mid-phrase ("fourteen point ..."). */
  dangling: boolean;
}

export function lex(text: string): LexResult {
  const words = tokenizeWords(text);
  const tokens: Token[] = [];
  const unknownWords: string[] = [];
  const fillerWords: string[] = [];
  let dangling = false;
  let i = 0;
  outer: while (i < words.length) {
    const w = words[i];

    // Correction phrases (multi-word)
    for (const phrase of CORRECTION_PHRASES) {
      if (phrase.every((p, k) => words[i + k] === p)) {
        tokens.push({ t: "corr" });
        i += phrase.length;
        continue outer;
      }
    }

    // Operator phrases (multi-word) — before number parsing so "square root of" wins
    for (const [phrase, tok] of OP_PHRASES) {
      if (phrase.every((p, k) => words[i + k] === p)) {
        tokens.push(tok);
        if (tok.t === "percent") tokens.push({ t: "op", v: "of" });
        i += phrase.length;
        continue outer;
      }
    }

    // "minus"/"negative" as unary sign is handled by the parser; lex it as an op.
    if (w === "negative") {
      tokens.push({ t: "op", v: "-" });
      i += 1;
      continue;
    }

    const num = parseNumberPhrase(words, i);
    if (num) {
      const raw = words.slice(i, num.next).join(" ");
      const spokenAsDecimal = /\bpoint\b/.test(raw) || /\d\.\d/.test(raw);
      const display = spokenAsDecimal ? (num.value.toExactDecimal() ?? formatNumber(num.value)) : formatNumber(num.value);
      tokens.push({ t: "num", v: num.value, raw, display });
      i = num.next;
      continue;
    }

    if (w in OP_WORDS) {
      tokens.push(OP_WORDS[w]);
      i += 1;
      continue;
    }
    if (CORRECTIONS.has(w)) {
      tokens.push({ t: "corr" });
      i += 1;
      continue;
    }
    if (FILLERS.has(w)) {
      fillerWords.push(w);
      i += 1;
      continue;
    }
    if (w === "point") {
      dangling = true; // "fourteen point" with nothing after: speaker was cut off
      i += 1;
      continue;
    }
    unknownWords.push(w);
    i += 1;
  }
  return { tokens, unknownWords, fillerWords, dangling };
}

function category(tok: Token): string {
  if (tok.t === "num") return "num";
  if (tok.t === "op") return "op";
  return tok.t;
}

/**
 * Apply self-corrections: for "A, sorry, B" remove everything back to and
 * including the most recent token of the same category as B.
 * "thirteen, sorry, fourteen times fifteen" -> 14 × 15
 * "thirteen times, sorry, plus fourteen" -> 13 + 14
 */
export function applyCorrections(tokens: Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.t !== "corr") {
      out.push(tok);
      i += 1;
      continue;
    }
    // collapse consecutive correction markers
    while (i < tokens.length && tokens[i].t === "corr") i += 1;
    const after = tokens[i];
    if (!after) break; // trailing "sorry" — just drop it
    const cat = category(after);
    let k = out.length - 1;
    while (k >= 0 && category(out[k]) !== cat) k -= 1;
    if (k >= 0) out.splice(k);
  }
  return out;
}

// ---------- Parser / evaluator ----------

class ParseError extends Error {
  constructor(public kind: "incomplete" | "unclear", message: string) {
    super(message);
  }
}

interface Node {
  value: Fraction;
  text: string;
  approximate: boolean;
}

class Parser {
  pos = 0;
  opCount = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parseAll(): Node {
    const n = this.expr();
    if (this.pos < this.tokens.length) {
      const rest = this.tokens[this.pos];
      if (rest.t === "num") throw new ParseError("unclear", "two numbers with no operator between them");
      throw new ParseError("unclear", "unexpected token");
    }
    return n;
  }

  expr(): Node {
    let left = this.term();
    for (;;) {
      const p = this.peek();
      if (p && p.t === "op" && (p.v === "+" || p.v === "-")) {
        this.next();
        const right = this.term();
        this.opCount++;
        left = p.v === "+"
          ? { value: left.value.add(right.value), text: `${left.text} + ${right.text}`, approximate: left.approximate || right.approximate }
          : { value: left.value.sub(right.value), text: `${left.text} − ${right.text}`, approximate: left.approximate || right.approximate };
      } else break;
    }
    return left;
  }

  term(): Node {
    let left = this.power();
    for (;;) {
      const p = this.peek();
      if (p && p.t === "op" && (p.v === "*" || p.v === "/" || p.v === "of")) {
        this.next();
        const right = this.power();
        this.opCount++;
        if (p.v === "*" || p.v === "of") {
          if (p.v === "of" && left.value.isInteger() && !left.text.includes("%")) {
            throw new ParseError("unclear", `"${left.text} of ${right.text}" is ambiguous`);
          }
          left = {
            value: left.value.mul(right.value),
            text: p.v === "of" ? `${left.text} of ${right.text}` : `${left.text} × ${right.text}`,
            approximate: left.approximate || right.approximate,
          };
        } else {
          if (right.value.isZero()) throw new ParseError("unclear", "division by zero");
          left = { value: left.value.div(right.value), text: `${left.text} ÷ ${right.text}`, approximate: left.approximate || right.approximate };
        }
      } else break;
    }
    return left;
  }

  power(): Node {
    const base = this.unary();
    const p = this.peek();
    if (p && p.t === "op" && p.v === "^") {
      this.next();
      const exp = this.unary();
      this.opCount++;
      if (!exp.value.isInteger() || exp.value.abs().compare(Fraction.fromInt(20)) > 0) {
        throw new ParseError("unclear", "only small integer exponents are supported");
      }
      return { value: base.value.pow(Number(exp.value.num)), text: `${base.text}^${exp.text}`, approximate: base.approximate };
    }
    return base;
  }

  unary(): Node {
    const p = this.peek();
    if (p && p.t === "op" && p.v === "-") {
      this.next();
      const n = this.unary();
      return { value: n.value.neg(), text: `−${n.text}`, approximate: n.approximate };
    }
    return this.postfix();
  }

  postfix(): Node {
    let n = this.primary();
    for (;;) {
      const p = this.peek();
      if (!p) break;
      if (p.t === "percent") {
        this.next();
        n = { value: n.value.div(Fraction.fromInt(100)), text: `${n.text}%`, approximate: n.approximate };
        // "X percent" followed by "of" is handled in term(); a bare "X percent" is not an operation.
      } else if (p.t === "squared") {
        this.next();
        this.opCount++;
        n = { value: n.value.pow(2), text: `${n.text}²`, approximate: n.approximate };
      } else if (p.t === "cubed") {
        this.next();
        this.opCount++;
        n = { value: n.value.pow(3), text: `${n.text}³`, approximate: n.approximate };
      } else break;
    }
    return n;
  }

  primary(): Node {
    const tok = this.next();
    if (!tok) throw new ParseError("incomplete", "expression ends with an operator");
    if (tok.t === "num") return { value: tok.v, text: tok.display, approximate: false };
    if (tok.t === "lparen") {
      const inner = this.expr();
      const close = this.next();
      if (!close || close.t !== "rparen") throw new ParseError("incomplete", "missing closing bracket");
      return { value: inner.value, text: `(${inner.text})`, approximate: inner.approximate };
    }
    if (tok.t === "sqrt") {
      const inner = this.primary();
      this.opCount++;
      if (inner.value.compare(Fraction.ZERO) < 0) throw new ParseError("unclear", "square root of a negative number");
      const exact = inner.value.sqrtExact();
      if (exact) return { value: exact, text: `√${inner.text}`, approximate: inner.approximate };
      return { value: Fraction.fromNumber(Math.sqrt(inner.value.toNumber())), text: `√${inner.text}`, approximate: true };
    }
    if (tok.t === "op") throw new ParseError("incomplete", "operator with no number before it");
    throw new ParseError("unclear", "unexpected token");
  }
}

export function formatNumber(v: Fraction): string {
  if (v.isInteger()) return v.toString();
  const dec = v.toExactDecimal(6);
  // Prefer the fraction form for "nice" denominators, decimal otherwise.
  if (v.den <= 16n) return v.toString();
  return dec ?? v.toString();
}

/** Full pipeline: text -> outcome. Deterministic; never evaluates arbitrary code. */
export function parseSpokenExpression(text: string): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "no_expression" };

  const lower = trimmed.toLowerCase();
  const words = tokenizeWords(lower);
  if (words.some((w) => LLM_KEYWORDS.includes(w))) {
    return { kind: "needs_llm", cleaned: trimmed, reason: "probability / expected-value wording" };
  }

  const { tokens: raw, unknownWords, dangling } = lex(trimmed);
  const tokens = applyCorrections(raw);
  if (dangling) return { kind: "incomplete", reason: "number cut off after \"point\"", expression: tokens.map(tokenText).join(" ") };

  const hasNumber = tokens.some((t) => t.t === "num");
  if (!hasNumber) return { kind: "no_expression" };

  const hasOperator = tokens.some((t) => t.t !== "num" && t.t !== "percent");
  if (!hasOperator) {
    const numCount = tokens.filter((t) => t.t === "num").length;
    if (numCount >= 2) {
      // "thirteen fourteen": two numbers, no operator — do not guess one.
      return { kind: "unclear", reason: "two numbers with no operator between them", expression: tokens.map(tokenText).join(" "), unknownWords };
    }
    // A lone number (or "twenty percent") is not a question — ignore it.
    return { kind: "no_expression" };
  }

  const parser = new Parser(tokens);
  try {
    const node = parser.parseAll();
    if (parser.opCount === 0) return { kind: "no_expression" };
    if (unknownWords.length > 0) {
      // We could compute, but some words were not understood. Only proceed if
      // the unknown words are few relative to the expression; otherwise say so.
      if (unknownWords.length > 2) {
        return { kind: "unclear", reason: `did not understand: ${unknownWords.join(", ")}`, expression: node.text, unknownWords };
      }
      return { kind: "ok", expression: node.text, value: node.value, approximate: node.approximate, ignoredWords: unknownWords };
    }
    return { kind: "ok", expression: node.text, value: node.value, approximate: node.approximate, ignoredWords: [] };
  } catch (e) {
    if (e instanceof ParseError) {
      const partial = tokens.map(tokenText).join(" ");
      // Only call it "incomplete" when every word was understood; otherwise we likely missed something.
      if (e.kind === "incomplete" && unknownWords.length === 0) return { kind: "incomplete", reason: e.message, expression: partial };
      return { kind: "unclear", reason: e.message, expression: partial, unknownWords };
    }
    return { kind: "unclear", reason: e instanceof Error ? e.message : "parse failure", unknownWords };
  }
}

function tokenText(t: Token): string {
  switch (t.t) {
    case "num": return t.display;
    case "op": return t.v === "*" ? "×" : t.v === "/" ? "÷" : t.v === "-" ? "−" : t.v;
    case "percent": return "%";
    case "squared": return "²";
    case "cubed": return "³";
    case "sqrt": return "√";
    case "lparen": return "(";
    case "rparen": return ")";
    case "corr": return "";
  }
}
