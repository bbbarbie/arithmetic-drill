export interface LlmAnswer {
  answer: string;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  /** Model identifier reported by the server (for transparency). */
  model?: string;
}

export interface LlmStatus {
  enabled: boolean;
  provider: string;
  model?: string;
}

export async function fetchLlmStatus(): Promise<LlmStatus> {
  try {
    const r = await fetch("/api/health");
    if (!r.ok) return { enabled: false, provider: "unreachable" };
    return (await r.json()) as LlmStatus;
  } catch {
    return { enabled: false, provider: "unreachable" };
  }
}

export async function solveWithLlm(question: string, signal?: AbortSignal): Promise<LlmAnswer> {
  const r = await fetch("/api/solve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Server error ${r.status}`);
  }
  return (await r.json()) as LlmAnswer;
}
