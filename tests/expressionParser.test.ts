import { describe, it, expect } from "vitest";
import { parseSpokenExpression } from "../src/lib/expressionParser.ts";

function value(s: string): string {
  const r = parseSpokenExpression(s);
  if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.value.toString();
}
function kind(s: string): string {
  return parseSpokenExpression(s).kind;
}

describe("spoken expression parser", () => {
  it("handles the specified examples", () => {
    expect(value("thirteen times fourteen")).toBe("182");
    expect(value("one hundred and twenty divided by eight")).toBe("15");
    expect(value("seventeen point five percent of eighty")).toBe("14");
    expect(value("three quarters plus one eighth")).toBe("7/8");
    expect(value("thirteen, sorry, fourteen times fifteen")).toBe("210");
  });
  it("ignores filler", () => {
    expect(value("okay next question what is thirteen times fourteen")).toBe("182");
    expect(value("What's 12 plus 15 please")).toBe("27");
    expect(value("so, um, twenty five percent of 80?")).toBe("20");
  });
  it("handles digit literals and symbols", () => {
    expect(value("13 x 14")).toBe("182");
    expect(value("120 / 8")).toBe("15");
    expect(value("17.5% of 80")).toBe("14");
    expect(value("3/4 + 1/8")).toBe("7/8");
    expect(value("2 ^ 10")).toBe("1024");
  });
  it("respects precedence and parentheses", () => {
    expect(value("two plus three times four")).toBe("14");
    expect(value("open bracket two plus three close bracket times four")).toBe("20");
    expect(value("ten minus four minus three")).toBe("3");
    expect(value("one hundred divided by four divided by five")).toBe("5");
    expect(value("negative three plus five")).toBe("2");
    expect(value("twelve squared")).toBe("144");
    expect(value("square root of one hundred and forty four")).toBe("12");
    expect(value("half of eighty")).toBe("40");
    expect(value("five and seven")).toBe("12");
    expect(value("two and a half times four")).toBe("10");
  });
  it("applies self-corrections", () => {
    expect(value("thirteen times, sorry, plus fourteen")).toBe("27");
    expect(value("thirteen times fourteen, no wait, fifteen")).toBe("195");
    expect(value("I mean, thirteen times fourteen")).toBe("182");
    expect(value("twelve, actually thirteen, times two")).toBe("26");
  });
  it("renders a readable expression", () => {
    const r = parseSpokenExpression("seventeen point five percent of eighty");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.expression).toBe("17.5% of 80");
    const r2 = parseSpokenExpression("three quarters plus one eighth");
    if (r2.kind === "ok") expect(r2.expression).toBe("3/4 + 1/8");
  });
  it("does not respond to incomplete utterances", () => {
    expect(kind("thirteen times")).toBe("incomplete");
    expect(kind("fourteen point")).toBe("incomplete");
    expect(kind("thirteen")).toBe("no_expression");
    expect(kind("twenty percent")).toBe("no_expression");
    expect(kind("okay next question")).toBe("no_expression");
    expect(kind("")).toBe("no_expression");
  });
  it("says unclear instead of inventing numbers", () => {
    expect(kind("thirteen fourteen")).toBe("unclear");
    expect(kind("ten divided by zero")).toBe("unclear");
    expect(kind("three of four")).toBe("unclear");
    expect(kind("what is the quarterly revenue growth forecast times two")).toBe("unclear");
  });
  it("routes probability wording to the LLM path", () => {
    expect(kind("what is the probability of two heads in three flips")).toBe("needs_llm");
    expect(kind("expected value of a fair die roll")).toBe("needs_llm");
  });
  it("marks approximate results", () => {
    const r = parseSpokenExpression("square root of two");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.approximate).toBe(true);
  });
  it("flags a short list of ignored words but still computes", () => {
    const r = parseSpokenExpression("thirteen times fourteen thanks");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.ignoredWords).toEqual(["thanks"]);
  });
});
