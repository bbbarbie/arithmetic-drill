import { describe, it, expect } from "vitest";
import { parseAnswer } from "../server/llm.ts";

describe("LLM response parsing", () => {
  it("extracts structured JSON", () => {
    const r = parseAnswer('Sure: {"answer":"3/8","assumptions":["fair coin"],"confidence":"high"}');
    expect(r).toEqual({ answer: "3/8", assumptions: ["fair coin"], confidence: "high" });
  });
  it("falls back safely on malformed output", () => {
    const r = parseAnswer("I think it is 3/8");
    expect(r.confidence).toBe("low");
    expect(r.answer).toContain("3/8");
  });
  it("never returns an empty answer", () => {
    expect(parseAnswer('{"answer":"","confidence":"high"}').answer).toBe("Unclear");
  });
});
