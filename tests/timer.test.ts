import { describe, it, expect } from "vitest";
import { CountdownTimer, formatClock } from "../src/lib/timer.ts";

describe("CountdownTimer", () => {
  it("counts down while running", () => {
    const t = new CountdownTimer(600_000);
    t.start(1000);
    expect(t.remaining(1000)).toBe(600_000);
    expect(t.remaining(61_000)).toBe(540_000);
    expect(t.elapsed(61_000)).toBe(60_000);
  });
  it("does not advance while paused and resumes from the same point", () => {
    const t = new CountdownTimer(600_000);
    t.start(0);
    t.pause(30_000);
    expect(t.remaining(30_000)).toBe(570_000);
    expect(t.remaining(90_000)).toBe(570_000); // paused for a minute
    t.resume(90_000);
    expect(t.remaining(90_000)).toBe(570_000);
    expect(t.remaining(100_000)).toBe(560_000);
    expect(t.getStatus()).toBe("running");
  });
  it("ignores invalid transitions", () => {
    const t = new CountdownTimer(1000);
    t.pause(5); // not running
    expect(t.getStatus()).toBe("idle");
    t.resume(5);
    expect(t.getStatus()).toBe("idle");
    t.start(10);
    t.start(20); // second start ignored
    expect(t.elapsed(30)).toBe(20);
  });
  it("finishes at zero and clamps", () => {
    const t = new CountdownTimer(1000);
    t.start(0);
    expect(t.tick(999).status).toBe("running");
    const snap = t.tick(1500);
    expect(snap.status).toBe("finished");
    expect(snap.remainingMs).toBe(0);
    expect(snap.elapsedMs).toBe(1000);
  });
  it("stop freezes elapsed time", () => {
    const t = new CountdownTimer(600_000);
    t.start(0);
    t.stop(45_000);
    expect(t.elapsed(99_000)).toBe(45_000);
    expect(t.getStatus()).toBe("finished");
  });
  it("formats the clock", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(5_000)).toBe("0:05");
    expect(formatClock(0)).toBe("0:00");
  });
});
