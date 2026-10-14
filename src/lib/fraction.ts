/**
 * Exact rational arithmetic on bigint numerator/denominator.
 * Denominator is always > 0 and gcd(num, den) === 1.
 */

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export class Fraction {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number, den: bigint | number = 1n) {
    let n = BigInt(num);
    let d = BigInt(den);
    if (d === 0n) throw new Error("Division by zero");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.num = g === 0n ? 0n : n / g;
    this.den = g === 0n ? 1n : d / g;
  }

  static ZERO = new Fraction(0n);
  static ONE = new Fraction(1n);

  static fromInt(n: number | bigint): Fraction {
    return new Fraction(BigInt(n), 1n);
  }

  /** Parse "17.5", "-3", "7/8", "0.875", "1,200". Returns null on failure. */
  static parse(text: string): Fraction | null {
    const s = text.trim().replace(/,/g, "");
    const frac = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (frac) {
      const d = BigInt(frac[2]);
      if (d === 0n) return null;
      return new Fraction(BigInt(frac[1]), d);
    }
    const dec = /^(-?)(\d*)(?:\.(\d+))?$/.exec(s);
    if (dec && (dec[2] || dec[3])) {
      const sign = dec[1] === "-" ? -1n : 1n;
      const intPart = dec[2] || "0";
      const fracPart = dec[3] || "";
      const scale = 10n ** BigInt(fracPart.length);
      const n = BigInt(intPart) * scale + BigInt(fracPart || "0");
      return new Fraction(sign * n, scale);
    }
    return null;
  }

  /** Build from a JS number that is an integer or a short decimal (<= 6 dp). */
  static fromNumber(x: number): Fraction {
    if (!Number.isFinite(x)) throw new Error("Not finite");
    if (Number.isInteger(x)) return Fraction.fromInt(x);
    const parsed = Fraction.parse(x.toFixed(6).replace(/0+$/, ""));
    if (!parsed) throw new Error("Cannot convert number");
    return parsed;
  }

  add(o: Fraction): Fraction {
    return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den);
  }
  sub(o: Fraction): Fraction {
    return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den);
  }
  mul(o: Fraction): Fraction {
    return new Fraction(this.num * o.num, this.den * o.den);
  }
  div(o: Fraction): Fraction {
    if (o.num === 0n) throw new Error("Division by zero");
    return new Fraction(this.num * o.den, this.den * o.num);
  }
  neg(): Fraction {
    return new Fraction(-this.num, this.den);
  }
  abs(): Fraction {
    return this.num < 0n ? this.neg() : this;
  }
  /** Integer exponent only (negative allowed). */
  pow(e: number): Fraction {
    if (!Number.isInteger(e)) throw new Error("Non-integer exponent");
    if (e === 0) return Fraction.ONE;
    const base = e < 0 ? Fraction.ONE.div(this) : this;
    const k = BigInt(Math.abs(e));
    return new Fraction(base.num ** k, base.den ** k);
  }
  /** Exact square root if both num and den are perfect squares, else null. */
  sqrtExact(): Fraction | null {
    if (this.num < 0n) return null;
    const rn = isqrt(this.num);
    const rd = isqrt(this.den);
    if (rn * rn !== this.num || rd * rd !== this.den) return null;
    return new Fraction(rn, rd);
  }

  equals(o: Fraction): boolean {
    return this.num === o.num && this.den === o.den;
  }
  compare(o: Fraction): number {
    const l = this.num * o.den;
    const r = o.num * this.den;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  isInteger(): boolean {
    return this.den === 1n;
  }
  isZero(): boolean {
    return this.num === 0n;
  }
  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  /** "7/8", "14", "-3/2" */
  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }

  /**
   * Exact decimal string if the denominator only has factors 2 and 5 (and
   * at most `maxPlaces` digits); otherwise null.
   */
  toExactDecimal(maxPlaces = 8): string | null {
    let d = this.den;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) {
      d /= 2n;
      twos++;
    }
    while (d % 5n === 0n) {
      d /= 5n;
      fives++;
    }
    if (d !== 1n) return null;
    const places = Math.max(twos, fives);
    if (places > maxPlaces) return null;
    if (places === 0) return this.num.toString();
    const scale = 10n ** BigInt(places);
    const scaled = (this.num * scale) / this.den;
    const neg = scaled < 0n;
    const abs = neg ? -scaled : scaled;
    const intPart = abs / scale;
    const fracPart = (abs % scale).toString().padStart(places, "0").replace(/0+$/, "");
    return `${neg ? "-" : ""}${intPart}${fracPart ? "." + fracPart : ""}`;
  }

  /** Approximate decimal, trimmed trailing zeros. */
  toApproxDecimal(places = 4): string {
    const s = this.toNumber().toFixed(places);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  }

  /**
   * Human display: integer -> "14"; terminating decimal -> "0.875 (7/8)";
   * otherwise "2/3 (≈0.6667)".
   */
  toDisplay(): string {
    if (this.isInteger()) return this.num.toString();
    const exact = this.toExactDecimal(6);
    if (exact !== null) return `${this.toString()} (${exact})`;
    return `${this.toString()} (≈${this.toApproxDecimal(4)})`;
  }
}

function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("negative");
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}
