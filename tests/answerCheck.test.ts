import { describe, it, expect } from "vitest";
import { Fraction } from "../src/lib/fraction.ts";
import { checkAnswer, parseAnswer, EXACT, DECIMAL_TOL } from "../src/lib/answerCheck.ts";

describe("answer parsing", () => {
  it("parses many phrasings", () => {
    expect(parseAnswer("14")!.value.toString()).toBe("14");
    expect(parseAnswer("fourteen")!.value.toString()).toBe("14");
    expect(parseAnswer("it's 14")!.value.toString()).toBe("14");
    expect(parseAnswer("the answer is seven eighths")!.value.toString()).toBe("7/8");
    expect(parseAnswer("7/8")!.value.toString()).toBe("7/8");
    expect(parseAnswer("seven over eight")!.value.toString()).toBe("7/8");
    expect(parseAnswer("0.875")!.value.toString()).toBe("7/8");
    expect(parseAnswer("negative three")!.value.toString()).toBe("-3");
    expect(parseAnswer("-3")!.value.toString()).toBe("-3");
    expect(parseAnswer("twelve dollars")!.value.toString()).toBe("12");
    expect(parseAnswer("$3.50")!.value.toString()).toBe("7/2");
    expect(parseAnswer("25 percent")!.value.toString()).toBe("1/4");
    expect(parseAnswer("twelve, sorry, thirteen")!.value.toString()).toBe("13");
  });
  it("rejects ambiguous answers", () => {
    expect(parseAnswer("twelve or thirteen")).toBeNull();
    expect(parseAnswer("hmm")).toBeNull();
    expect(parseAnswer("12 13")).toBeNull();
  });
});

describe("checkAnswer", () => {
  it("requires exact match for integer answers", () => {
    expect(checkAnswer(new Fraction(182), "182", EXACT).correct).toBe(true);
    expect(checkAnswer(new Fraction(182), "183", EXACT).correct).toBe(false);
    expect(checkAnswer(new Fraction(182), "182.004", EXACT).correct).toBe(false);
  });
  it("accepts equivalent fraction / decimal forms", () => {
    expect(checkAnswer(new Fraction(7, 8), "0.875", EXACT).correct).toBe(true);
    expect(checkAnswer(new Fraction(7, 8), "seven eighths", EXACT).correct).toBe(true);
    expect(checkAnswer(new Fraction(7, 8), "14/16", EXACT).correct).toBe(true);
  });
  it("applies the decimal tolerance", () => {
    expect(checkAnswer(new Fraction(1, 3), "0.33", DECIMAL_TOL).correct).toBe(true);
    expect(checkAnswer(new Fraction(1, 3), "0.3", DECIMAL_TOL).correct).toBe(false);
    expect(checkAnswer(new Fraction(7, 2), "3.5", DECIMAL_TOL).correct).toBe(true);
  });
  it("optionally accepts percent form for probabilities", () => {
    expect(checkAnswer(new Fraction(1, 4), "25 percent", DECIMAL_TOL).correct).toBe(true);
    expect(checkAnswer(new Fraction(1, 4), "25", DECIMAL_TOL, { acceptPercentForm: true }).correct).toBe(true);
    expect(checkAnswer(new Fraction(1, 4), "25", DECIMAL_TOL).correct).toBe(false);
  });
  it("reports unparseable answers", () => {
    const r = checkAnswer(new Fraction(5), "no idea", EXACT);
    expect(r.correct).toBe(false);
    expect(r.parsed).toBeNull();
  });
});
