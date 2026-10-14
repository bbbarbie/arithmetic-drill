import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider, DisabledProvider } from "./llm.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "16kb" }));

const provider = createProvider(process.env);
const enabled = !(provider instanceof DisabledProvider);
console.log(`[api] LLM provider: ${provider.name}${provider.model ? ` (${provider.model})` : ""}`);

app.get("/api/health", (_req, res) => {
  res.json({ enabled, provider: provider.name, model: provider.model });
});

app.post("/api/solve", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) return res.status(400).json({ error: "question is required" });
  if (question.length > 600) return res.status(400).json({ error: "question too long" });
  if (!enabled) return res.status(503).json({ error: "LLM provider not configured" });
  try {
    const answer = await provider.solve(question);
    res.json(answer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "LLM request failed";
    console.error("[api] solve failed:", message);
    res.status(502).json({ error: message });
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(here, "..", "dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
