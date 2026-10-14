import Anthropic from "@anthropic-ai/sdk";

export interface LlmAnswer {
  answer: string;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  model?: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model?: string;
  solve(question: string): Promise<LlmAnswer>;
}

const SYSTEM = `You answer short quantitative interview questions (probability, expected value, combinatorics, mental math) that were transcribed from speech.
Reply with ONLY a JSON object: {"answer": string, "assumptions": string[], "confidence": "high"|"medium"|"low"}.
- "answer": the concise final result (a number, fraction, or one short phrase). Include units if money is involved.
- "assumptions": anything you had to assume because the question left it unspecified (e.g. "fair coin", "with replacement"). Empty array if none.
- "confidence": low if the transcript is garbled, the question is incomplete, or key numbers are missing. In that case set "answer" to "Unclear" and say what is missing in assumptions.
Never invent numbers that were not in the question. Do not show working.`;

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  constructor(readonly model: string) {
    this.client = new Anthropic(); // reads ANTHROPIC_API_KEY (or an `ant auth login` profile)
  }

  async solve(question: string): Promise<LlmAnswer> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: question }],
    });
    if (response.stop_reason === "refusal") {
      return { answer: "Unclear", assumptions: ["The model declined to answer this request."], confidence: "low", model: response.model };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { ...parseAnswer(text), model: response.model };
  }
}

export class DisabledProvider implements LlmProvider {
  readonly name = "none";
  async solve(): Promise<LlmAnswer> {
    throw new Error("LLM provider is not configured (set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env)");
  }
}

export function parseAnswer(text: string): LlmAnswer {
  const m = /\{[\s\S]*\}/.exec(text);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as Partial<LlmAnswer>;
      const conf = j.confidence === "high" || j.confidence === "medium" || j.confidence === "low" ? j.confidence : "low";
      return {
        answer: typeof j.answer === "string" && j.answer.trim() ? j.answer.trim() : "Unclear",
        assumptions: Array.isArray(j.assumptions) ? j.assumptions.filter((a): a is string => typeof a === "string") : [],
        confidence: conf,
      };
    } catch {
      /* fall through */
    }
  }
  return { answer: text.slice(0, 200) || "Unclear", assumptions: ["Response was not structured; shown verbatim."], confidence: "low" };
}

export function createProvider(env: NodeJS.ProcessEnv): LlmProvider {
  const kind = (env.LLM_PROVIDER ?? "none").toLowerCase();
  if (kind === "anthropic") {
    if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) {
      console.warn("[llm] LLM_PROVIDER=anthropic but no ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN set; relying on an `ant auth login` profile if present.");
    }
    return new AnthropicProvider(env.ANTHROPIC_MODEL || "claude-opus-5-5");
  }
  return new DisabledProvider();
}
