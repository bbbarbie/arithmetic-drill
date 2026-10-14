import { describe, it, expect } from "vitest";
import { generateQuestion, makeRng, phaseForElapsed, type Phase, type Question } from "../src/lib/questionGen.ts";
import { parseSpokenExpression } from "../src/lib/expressionParser.ts";
import { checkAnswer } from "../src/lib/answerCheck.ts";

function sample(phase: Phase, n: number, seed = 42, difficulty: "easy" | "standard" | "hard" = "standard"): Question[] {
  const r = makeRng(seed);
  const seen = new Set<string>();
  return Array.from({ length: n }, () => generateQuestion(phase, r, difficulty, seen));
}

describe("phase schedule", () => {
  it("maps elapsed time to phases", () => {
    expect(phaseForElapsed(0)).toBe(1);
    expect(phaseForElapsed(119_999)).toBe(1);
    expect(phaseForElapsed(120_000)).toBe(2);
    expect(phaseForElapsed(419_999)).toBe(2);
    expect(phaseForElapsed(420_000)).toBe(3);
    expect(phaseForElapsed(600_000)).toBe(3);
  });
});

describe("question generation", () => {
  it("phase 1 is basic arithmetic within range", () => {
    for (const q of sample(1, 200)) {
      expect(["addition", "subtraction", "multiplication", "division"]).toContain(q.topic);
      expect(q.answer.isInteger()).toBe(true);
      expect(q.answer.compare(q.answer.abs())).toBe(0); // non-negative
      expect(q.answer.toNumber()).toBeLessThanOrEqual(2000);
    }
  });
  it("phase 2 is mostly two-digit multiplication plus fractions/decimals/percent", () => {
    const qs = sample(2, 300);
    const topics = new Set(qs.map((q) => q.topic));
    expect(topics).toContain("multiplication");
    expect(topics).toContain("fractions");
    expect(topics).toContain("decimals");
    expect(topics).toContain("percentages");
    const mult = qs.filter((q) => q.topic === "multiplication").length;
    expect(mult / qs.length).toBeGreaterThan(0.3);
  });
  it("phase 3 includes probability and expected value", () => {
    const topics = new Set(sample(3, 200).map((q) => q.topic));
    expect(topics).toContain("probability");
    expect(topics).toContain("expected-value");
  });
  it("arithmetic prompts evaluate to the stored answer via the deterministic parser", () => {
    for (const phase of [1, 2] as Phase[]) {
      for (const q of sample(phase, 150, 7)) {
        const r = parseSpokenExpression(q.spoken);
        expect(r.kind, `${q.spoken}`).toBe("ok");
        if (r.kind === "ok") expect(r.value.equals(q.answer), `${q.spoken} => ${r.value} vs ${q.answer}`).toBe(true);
      }
    }
  });
  it("probabilities are in [0,1]; the stored answer checks as correct", () => {
    for (const q of sample(3, 200, 3)) {
      if (q.topic === "probability") {
        expect(q.answer.toNumber()).toBeGreaterThanOrEqual(0);
        expect(q.answer.toNumber()).toBeLessThanOrEqual(1);
      }
      expect(checkAnswer(q.answer, q.answer.toString(), q.tolerance).correct).toBe(true);
    }
  });
  it("avoids repeating a prompt within a session", () => {
    const qs = sample(1, 60, 11);
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(qs.length);
  });
  it("is reproducible with the same seed", () => {
    const a = sample(2, 10, 99).map((q) => q.prompt);
    const b = sample(2, 10, 99).map((q) => q.prompt);
    expect(a).toEqual(b);
  });
  it("easy difficulty keeps numbers smaller", () => {
    for (const q of sample(1, 100, 5, "easy")) {
      if (q.topic === "addition") expect(q.answer.toNumber()).toBeLessThan(200);
    }
  });
});
