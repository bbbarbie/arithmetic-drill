import { Fraction } from "./fraction.ts";
import { DECIMAL_TOL, EXACT, type Tolerance } from "./answerCheck.ts";

export type Topic =
  | "addition"
  | "subtraction"
  | "multiplication"
  | "division"
  | "fractions"
  | "decimals"
  | "percentages"
  | "probability"
  | "expected-value";

export type Phase = 1 | 2 | 3;
export type Difficulty = "easy" | "standard" | "hard";

export interface Question {
  id: string;
  topic: Topic;
  phase: Phase;
  /** Shown on screen. */
  prompt: string;
  /** Read aloud by TTS (numbers phrased for speech). */
  spoken: string;
  answer: Fraction;
  tolerance: Tolerance;
  /** Accept "25" or "25 percent" for an answer of 1/4. */
  acceptPercentForm: boolean;
  /** One-line mental method shown in the results screen. */
  method: string;
}

export interface Rng {
  /** float in [0,1) */
  next(): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
}

/** mulberry32 — small seeded PRNG so sessions are reproducible in tests. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Phase from elapsed minutes: 0–2 → 1, 2–7 → 2, 7–10 → 3. */
export function phaseForElapsed(elapsedMs: number): Phase {
  const min = elapsedMs / 60000;
  if (min < 2) return 1;
  if (min < 7) return 2;
  return 3;
}

const F = (n: number, d = 1) => new Fraction(n, d);

function spokenFraction(fr: Fraction): string {
  if (fr.isInteger()) return fr.toString();
  const n = Number(fr.num);
  const d = Number(fr.den);
  const names: Record<number, [string, string]> = {
    2: ["half", "halves"], 3: ["third", "thirds"], 4: ["quarter", "quarters"], 5: ["fifth", "fifths"],
    6: ["sixth", "sixths"], 8: ["eighth", "eighths"], 10: ["tenth", "tenths"], 12: ["twelfth", "twelfths"],
  };
  const nm = names[d];
  if (nm) return `${n} ${n === 1 ? nm[0] : nm[1]}`;
  return `${n} over ${d}`;
}

// ---------- Phase 1: basic arithmetic ----------

function genAddition(r: Rng, d: Difficulty): Question {
  const hi = d === "easy" ? 99 : 999;
  const a = r.int(d === "easy" ? 10 : 100, hi);
  const b = r.int(10, hi);
  return mk("addition", 1, `${a} + ${b}`, `${a} plus ${b}`, F(a + b), EXACT,
    `Add hundreds, then tens, then ones: ${a} + ${b} = ${a + b}.`);
}

function genSubtraction(r: Rng, d: Difficulty): Question {
  const hi = d === "easy" ? 99 : 999;
  let a = r.int(d === "easy" ? 20 : 100, hi);
  let b = r.int(10, hi);
  if (b > a) [a, b] = [b, a];
  return mk("subtraction", 1, `${a} − ${b}`, `${a} minus ${b}`, F(a - b), EXACT,
    `Count up from ${b} to ${a}: round ${b} up to a convenient number, then add the rest.`);
}

function genEasyMultiplication(r: Rng, d: Difficulty): Question {
  const a = r.int(2, d === "hard" ? 15 : 12);
  const b = r.int(2, d === "easy" ? 9 : 12);
  return mk("multiplication", 1, `${a} × ${b}`, `${a} times ${b}`, F(a * b), EXACT, `Times table: ${a} × ${b} = ${a * b}.`);
}

function genEasyDivision(r: Rng, d: Difficulty): Question {
  const b = r.int(2, d === "easy" ? 9 : 12);
  const q = r.int(2, d === "hard" ? 25 : 12);
  const a = b * q;
  return mk("division", 1, `${a} ÷ ${b}`, `${a} divided by ${b}`, F(q), EXACT, `Ask "what times ${b} gives ${a}?" → ${q}.`);
}

// ---------- Phase 2: 2-digit products, fractions, decimals, percentages ----------

function genTwoDigitMultiplication(r: Rng, d: Difficulty): Question {
  const lo = d === "easy" ? 11 : 12;
  const hi = d === "easy" ? 25 : d === "hard" ? 99 : 49;
  const a = r.int(lo, hi);
  const b = r.int(lo, d === "easy" ? 19 : hi);
  const tens = Math.floor(b / 10) * 10;
  const ones = b % 10;
  const method = ones === 0
    ? `${a} × ${b} = ${a} × ${tens / 10} × 10.`
    : `Split: ${a} × ${tens} = ${a * tens}, plus ${a} × ${ones} = ${a * ones}, total ${a * b}.`;
  return mk("multiplication", 2, `${a} × ${b}`, `${a} times ${b}`, F(a * b), EXACT, method);
}

function genFraction(r: Rng, d: Difficulty): Question {
  const dens = d === "easy" ? [2, 4, 8] : [2, 3, 4, 5, 6, 8, 10, 12];
  const kind = r.pick(["add", "sub", "mul", "of"] as const);
  if (kind === "mul") {
    const a = new Fraction(r.int(1, 3), r.pick(dens));
    const b = new Fraction(r.int(1, 3), r.pick(dens));
    const ans = a.mul(b);
    return mk("fractions", 2, `${a} × ${b}`, `${spokenFraction(a)} times ${spokenFraction(b)}`, ans, EXACT,
      `Multiply tops and bottoms, then simplify: ${a.num * b.num}/${a.den * b.den} = ${ans}.`);
  }
  if (kind === "of") {
    const f = new Fraction(r.int(1, 3), r.pick([2, 3, 4, 5, 8]));
    const whole = Number(f.den) * r.int(2, d === "hard" ? 20 : 12);
    const ans = f.mul(F(whole));
    return mk("fractions", 2, `${f} of ${whole}`, `${spokenFraction(f)} of ${whole}`, ans, EXACT,
      `Divide by ${f.den} first (${whole} ÷ ${f.den} = ${whole / Number(f.den)}), then multiply by ${f.num}.`);
  }
  let a = new Fraction(r.int(1, 5), r.pick(dens));
  let b = new Fraction(r.int(1, 5), r.pick(dens));
  if (a.isInteger()) a = new Fraction(1, 2);
  if (b.isInteger()) b = new Fraction(1, 4);
  if (kind === "sub" && a.compare(b) < 0) [a, b] = [b, a];
  const ans = kind === "add" ? a.add(b) : a.sub(b);
  const lcd = lcm(Number(a.den), Number(b.den));
  const op = kind === "add" ? "+" : "−";
  const spokenOp = kind === "add" ? "plus" : "minus";
  return mk("fractions", 2, `${a} ${op} ${b}`, `${spokenFraction(a)} ${spokenOp} ${spokenFraction(b)}`, ans, EXACT,
    `Common denominator ${lcd}: ${a.mul(F(lcd)).toString()}/${lcd} ${op} ${b.mul(F(lcd)).toString()}/${lcd} = ${ans}.`);
}

function genDecimal(r: Rng, d: Difficulty): Question {
  const kind = r.pick(["add", "sub", "mul"] as const);
  if (kind === "mul") {
    const a = Fraction.parse(`${r.int(1, d === "hard" ? 30 : 12)}.${r.int(1, 9)}`)!;
    const b = r.int(2, d === "easy" ? 5 : 9);
    const ans = a.mul(F(b));
    return mk("decimals", 2, `${a.toExactDecimal()} × ${b}`, `${a.toExactDecimal()} times ${b}`, ans, DECIMAL_TOL,
      `Ignore the point: ${Number(a.num)} × ${b} = ${Number(a.num) * b}, then put one decimal place back.`);
  }
  const places = d === "easy" ? 1 : r.pick([1, 2]);
  const sc = 10 ** places;
  let a = r.int(sc, (d === "hard" ? 100 : 50) * sc);
  let b = r.int(sc, 50 * sc);
  if (kind === "sub" && b > a) [a, b] = [b, a];
  const fa = new Fraction(a, sc);
  const fb = new Fraction(b, sc);
  const ans = kind === "add" ? fa.add(fb) : fa.sub(fb);
  const op = kind === "add" ? "+" : "−";
  const spokenOp = kind === "add" ? "plus" : "minus";
  return mk("decimals", 2, `${fa.toExactDecimal()} ${op} ${fb.toExactDecimal()}`,
    `${fa.toExactDecimal()} ${spokenOp} ${fb.toExactDecimal()}`, ans, DECIMAL_TOL,
    `Line up the decimal points; work in ${places === 1 ? "tenths" : "hundredths"}: ${a} ${op} ${b} = ${kind === "add" ? a + b : a - b}, then divide by ${sc}.`);
}

function genPercentage(r: Rng, d: Difficulty): Question {
  const pcts = d === "easy" ? [10, 20, 25, 50] : d === "hard" ? [5, 12.5, 15, 17.5, 30, 35, 40, 45, 60, 75, 85] : [5, 10, 15, 20, 25, 30, 40, 60, 75];
  const p = r.pick(pcts);
  const bases = [20, 40, 50, 60, 80, 120, 150, 200, 240, 250, 300, 400, 480, 500, 600, 800, 1200];
  const base = r.pick(bases);
  const pf = Fraction.fromNumber(p);
  const ans = pf.div(F(100)).mul(F(base));
  const tenPct = base / 10;
  const method = p % 10 === 0
    ? `10% of ${base} is ${tenPct}; multiply by ${p / 10}.`
    : p === 25 ? `25% is a quarter: ${base} ÷ 4.` : p === 75 ? `75% is three quarters: ${base} ÷ 4 × 3.`
    : p === 12.5 ? `12.5% is one eighth: ${base} ÷ 8.`
    : `10% of ${base} is ${tenPct}, 5% is ${tenPct / 2}; combine: ${p}% = ${ans.toDisplay()}.`;
  return mk("percentages", 2, `${p}% of ${base}`, `${p} percent of ${base}`, ans, DECIMAL_TOL, method);
}

// ---------- Phase 3: probability & expected value ----------

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function genProbability(r: Rng, d: Difficulty): Question {
  const kind = r.pick(d === "easy" ? ["coinExact", "dieAtLeast", "dieEven"] as const : ["coinExact", "coinAtLeastOne", "twoDiceSum", "dieAtLeast", "dieEven", "twoCoinsBoth"] as const);
  switch (kind) {
    case "coinExact": {
      const n = r.int(2, d === "hard" ? 4 : 3);
      const k = r.int(0, n);
      const ans = new Fraction(binom(n, k), 2 ** n);
      return mk("probability", 3, `P(exactly ${k} heads in ${n} fair coin flips)`,
        `A fair coin is flipped ${n} times. What is the probability of exactly ${k} heads?`, ans, DECIMAL_TOL,
        `${2 ** n} equally likely outcomes; C(${n},${k}) = ${binom(n, k)} of them have ${k} heads → ${ans}.`, true);
    }
    case "coinAtLeastOne": {
      const n = r.int(2, 4);
      const ans = Fraction.ONE.sub(new Fraction(1, 2 ** n));
      return mk("probability", 3, `P(at least one head in ${n} fair coin flips)`,
        `A fair coin is flipped ${n} times. What is the probability of at least one head?`, ans, DECIMAL_TOL,
        `1 − P(all tails) = 1 − 1/${2 ** n} = ${ans}.`, true);
    }
    case "twoCoinsBoth": {
      return mk("probability", 3, `P(both heads, two fair coins)`,
        `Two fair coins are flipped. What is the probability both land heads?`, new Fraction(1, 4), DECIMAL_TOL,
        `Independent: 1/2 × 1/2 = 1/4.`, true);
    }
    case "twoDiceSum": {
      const s = r.pick([4, 5, 6, 7, 8, 9, 10]);
      const ways = s <= 7 ? s - 1 : 13 - s;
      const ans = new Fraction(ways, 36);
      return mk("probability", 3, `P(sum = ${s}, two fair dice)`,
        `Two fair six-sided dice are rolled. What is the probability the sum is ${s}?`, ans, DECIMAL_TOL,
        `${ways} of 36 ordered pairs sum to ${s} → ${ans}.`, true);
    }
    case "dieAtLeast": {
      const k = r.int(2, 5);
      const ans = new Fraction(7 - k, 6);
      return mk("probability", 3, `P(roll ≥ ${k}, one fair die)`,
        `A fair six-sided die is rolled once. What is the probability of rolling at least ${k}?`, ans, DECIMAL_TOL,
        `Faces ${k} through 6: ${7 - k} of 6 → ${ans}.`, true);
    }
    case "dieEven": {
      const which = r.pick(["even", "odd", "prime"] as const);
      const faces = which === "prime" ? [2, 3, 5] : which === "even" ? [2, 4, 6] : [1, 3, 5];
      return mk("probability", 3, `P(roll is ${which}, one fair die)`,
        `A fair six-sided die is rolled once. What is the probability the result is ${which}?`, new Fraction(faces.length, 6), DECIMAL_TOL,
        `Faces ${faces.join(", ")}: ${faces.length} of 6 = ${new Fraction(faces.length, 6)}.`, true);
    }
  }
}

function genExpectedValue(r: Rng, d: Difficulty): Question {
  const kind = r.pick(d === "easy" ? ["die", "coinBet"] as const : ["die", "coinBet", "sixBet", "twoCoinsBet"] as const);
  switch (kind) {
    case "die": {
      const mult = r.pick([1, 2, 10]);
      const ans = new Fraction(7 * mult, 2);
      const desc = mult === 1 ? "the face value in dollars" : `${mult} dollars times the face value`;
      return mk("expected-value", 3, `E[payout]: fair die, win ${mult === 1 ? "$face" : `$${mult}×face`}`,
        `You roll a fair six-sided die and receive ${desc}. What is the expected payout in dollars?`, ans, DECIMAL_TOL,
        `E[face] = 3.5, so payout = 3.5 × ${mult} = ${ans.toExactDecimal()}.`);
    }
    case "coinBet": {
      const win = r.int(1, 10) * (d === "hard" ? 3 : 2);
      const lose = r.int(1, 10);
      const ans = new Fraction(win - lose, 2);
      return mk("expected-value", 3, `E[bet]: fair coin, +$${win} heads / −$${lose} tails`,
        `A fair coin is flipped. You win ${win} dollars on heads and lose ${lose} dollars on tails. What is the expected value of the bet in dollars?`,
        ans, DECIMAL_TOL, `(1/2)(${win}) + (1/2)(−${lose}) = ${ans.toExactDecimal()}.`);
    }
    case "sixBet": {
      const win = r.pick([6, 12, 18, 24, 30, 60]);
      const lose = r.int(1, 6);
      const ans = new Fraction(win - 5 * lose, 6);
      return mk("expected-value", 3, `E[bet]: fair die, +$${win} on a six / −$${lose} otherwise`,
        `A fair six-sided die is rolled. You win ${win} dollars if it shows a six and lose ${lose} dollars otherwise. What is the expected value in dollars?`,
        ans, DECIMAL_TOL, `(1/6)(${win}) − (5/6)(${lose}) = ${win}/6 − ${5 * lose}/6 = ${ans.toDisplay()}.`);
    }
    case "twoCoinsBet": {
      const win = r.pick([4, 8, 12, 20]);
      const lose = r.int(1, 5);
      const ans = new Fraction(win - 3 * lose, 4);
      return mk("expected-value", 3, `E[bet]: two fair coins, +$${win} if both heads / −$${lose} otherwise`,
        `Two fair coins are flipped. You win ${win} dollars if both are heads and lose ${lose} dollars otherwise. What is the expected value in dollars?`,
        ans, DECIMAL_TOL, `P(both heads) = 1/4: (1/4)(${win}) − (3/4)(${lose}) = ${ans.toDisplay()}.`);
    }
  }
}

// ---------- Dispatcher ----------

let counter = 0;
function mk(topic: Topic, phase: Phase, prompt: string, spoken: string, answer: Fraction, tolerance: Tolerance, method: string, acceptPercentForm = false): Question {
  counter += 1;
  return { id: `q${counter}`, topic, phase, prompt, spoken, answer, tolerance, method, acceptPercentForm };
}

function lcm(a: number, b: number): number {
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  return (a * b) / g(a, b);
}

const PHASE_GENERATORS: Record<Phase, Array<[number, (r: Rng, d: Difficulty) => Question]>> = {
  1: [[3, genAddition], [3, genSubtraction], [2, genEasyMultiplication], [2, genEasyDivision]],
  2: [[4, genTwoDigitMultiplication], [2, genFraction], [2, genDecimal], [2, genPercentage]],
  3: [[1, genTwoDigitMultiplication], [1, genPercentage], [3, genProbability], [3, genExpectedValue]],
};

function weightedPick(r: Rng, entries: Array<[number, (r: Rng, d: Difficulty) => Question]>) {
  const total = entries.reduce((s, [w]) => s + w, 0);
  let x = r.next() * total;
  for (const [w, g] of entries) {
    if (x < w) return g;
    x -= w;
  }
  return entries[entries.length - 1][1];
}

/**
 * Generate a question for the phase, avoiding prompts already seen in this
 * session (so the drill feels varied). `seen` is mutated.
 */
export function generateQuestion(phase: Phase, r: Rng, difficulty: Difficulty, seen: Set<string> = new Set()): Question {
  for (let attempt = 0; attempt < 30; attempt++) {
    const q = weightedPick(r, PHASE_GENERATORS[phase])(r, difficulty);
    if (!seen.has(q.prompt)) {
      seen.add(q.prompt);
      return q;
    }
  }
  const q = weightedPick(r, PHASE_GENERATORS[phase])(r, difficulty);
  seen.add(q.prompt);
  return q;
}

export const TOPIC_LABELS: Record<Topic, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
  fractions: "Fractions",
  decimals: "Decimals",
  percentages: "Percentages",
  probability: "Probability",
  "expected-value": "Expected value",
};
