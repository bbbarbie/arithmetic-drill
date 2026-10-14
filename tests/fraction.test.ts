import { describe, it, expect } from "vitest";
import { Fraction } from "../src/lib/fraction.ts";

describe("Fraction", () => {
  it("normalises sign and reduces", () => {
    expect(new Fraction(6, -8).toString()).toBe("-3/4");
    expect(new Fraction(0, 5).toString()).toBe("0");
  });
  it("parses decimals, fractions, integers", () => {
    expect(Fraction.parse("17.5")!.toString()).toBe("35/2");
    expect(Fraction.parse("0.875")!.toString()).toBe("7/8");
    expect(Fraction.parse("7/8")!.toString()).toBe("7/8");
    expect(Fraction.parse("-3")!.toString()).toBe("-3");
    expect(Fraction.parse("1,200")!.toString()).toBe("1200");
    expect(Fraction.parse("abc")).toBeNull();
    expect(Fraction.parse("1/0")).toBeNull();
  });
  it("does exact arithmetic", () => {
    const a = new Fraction(3, 4);
    const b = new Fraction(1, 8);
    expect(a.add(b).toString()).toBe("7/8");
    expect(a.sub(b).toString()).toBe("5/8");
    expect(a.mul(b).toString()).toBe("3/32");
    expect(a.div(b).toString()).toBe("6");
    expect(Fraction.parse("0.1")!.add(Fraction.parse("0.2")!).toExactDecimal()).toBe("0.3");
  });
  it("formats exact decimals and detects repeating ones", () => {
    expect(new Fraction(7, 8).toExactDecimal()).toBe("0.875");
    expect(new Fraction(35, 2).toExactDecimal()).toBe("17.5");
    expect(new Fraction(2, 3).toExactDecimal()).toBeNull();
    expect(new Fraction(2, 3).toDisplay()).toBe("2/3 (≈0.6667)");
    expect(new Fraction(14).toDisplay()).toBe("14");
    expect(new Fraction(-1, 4).toExactDecimal()).toBe("-0.25");
  });
  it("powers and exact roots", () => {
    expect(new Fraction(3, 2).pow(2).toString()).toBe("9/4");
    expect(new Fraction(2).pow(-2).toString()).toBe("1/4");
    expect(new Fraction(144).sqrtExact()!.toString()).toBe("12");
    expect(new Fraction(9, 16).sqrtExact()!.toString()).toBe("3/4");
    expect(new Fraction(2).sqrtExact()).toBeNull();
  });
});
