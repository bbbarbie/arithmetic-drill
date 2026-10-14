/**
 * Pure countdown state machine. All methods take `now` (ms) so it can be
 * tested deterministically and driven by requestAnimationFrame/setInterval.
 */
export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerSnapshot {
  status: TimerStatus;
  elapsedMs: number;
  remainingMs: number;
}

export class CountdownTimer {
  private status: TimerStatus = "idle";
  private accumulated = 0; // elapsed ms from completed running segments
  private segmentStart: number | null = null;

  constructor(public readonly durationMs: number) {}

  start(now: number): void {
    if (this.status !== "idle") return;
    this.status = "running";
    this.segmentStart = now;
  }

  pause(now: number): void {
    if (this.status !== "running") return;
    this.accumulated += now - (this.segmentStart ?? now);
    this.segmentStart = null;
    this.status = "paused";
  }

  resume(now: number): void {
    if (this.status !== "paused") return;
    this.status = "running";
    this.segmentStart = now;
  }

  stop(now: number): void {
    if (this.status === "running") this.accumulated += now - (this.segmentStart ?? now);
    this.segmentStart = null;
    this.status = "finished";
  }

  elapsed(now: number): number {
    const live = this.status === "running" && this.segmentStart !== null ? now - this.segmentStart : 0;
    return Math.min(this.durationMs, this.accumulated + live);
  }

  remaining(now: number): number {
    return Math.max(0, this.durationMs - this.elapsed(now));
  }

  /** Call on each tick; transitions to finished when time is up. */
  tick(now: number): TimerSnapshot {
    if (this.status === "running" && this.remaining(now) <= 0) this.stop(now);
    return this.snapshot(now);
  }

  snapshot(now: number): TimerSnapshot {
    return { status: this.status, elapsedMs: this.elapsed(now), remainingMs: this.remaining(now) };
  }

  getStatus(): TimerStatus {
    return this.status;
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
