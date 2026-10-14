import { describe, it, expect } from "vitest";
import { wordsToNumber } from "../src/lib/numberWords.ts";

const n = (s: string) => wordsToNumber(s)?.toString() ?? null;

describe("spoken numbers", () => {
  it("parses units, teens, tens", () => {
    expect(n("thirteen")).toBe("13");
    expect(n("forty two")).toBe("42");
    expect(n("forty-two")).toBe("42");
    expect(n("ninety")).toBe("90");
    expect(n("zero")).toBe("0");
  });
  it("parses hundreds and thousands with optional 'and'", () => {
    expect(n("one hundred and twenty")).toBe("120");
    expect(n("one hundred twenty")).toBe("120");
    expect(n("a hundred")).toBe("100");
    expect(n("three hundred and five")).toBe("305");
    expect(n("two thousand")).toBe("2000");
    expect(n("two thousand and fifty")).toBe("2050");
    expect(n("one thousand two hundred and thirty four")).toBe("1234");
  });
  it("parses decimals", () => {
    expect(n("seventeen point five")).toBe("35/2");
    expect(n("fourteen point two five")).toBe("57/4");
    expect(n("zero point seven five")).toBe("3/4");
    expect(n("three point one four")).toBe("157/50");
  });
  it("parses fraction words and mixed numbers", () => {
    expect(n("three quarters")).toBe("3/4");
    expect(n("one eighth")).toBe("1/8");
    expect(n("a half")).toBe("1/2");
    expect(n("half")).toBe("1/2");
    expect(n("two thirds")).toBe("2/3");
    expect(n("two and a half")).toBe("5/2");
    expect(n("one and three quarters")).toBe("7/4");
    expect(n("seven eighths")).toBe("7/8");
  });
  it("parses digit literals", () => {
    expect(n("120")).toBe("120");
    expect(n("17.5")).toBe("35/2");
    expect(n("3/4")).toBe("3/4");
    expect(n("$12")).toBe("12");
    expect(n("1,250")).toBe("1250");
  });
  it("rejects non-numbers", () => {
    expect(n("banana")).toBeNull();
    expect(n("")).toBeNull();
  });
});
