import type { Question, Topic } from "./questionGen.ts";
import { TOPIC_LABELS } from "./questionGen.ts";

export interface QuestionRecord {
  question: Question;
  /** null until the first submission or pass. */
  firstAttemptCorrect: boolean | null;
  attempts: number;
  passed: boolean;
  /** ms from the end of question playback to the first submission. */
  responseTimeMs: number | null;
  answers: string[];
  finalCorrect: boolean;
}

export interface TopicSummary {
  topic: Topic;
  label: string;
  asked: number;
  firstAttemptCorrect: number;
  retries: number;
  passes: number;
  avgResponseMs: number | null;
}

export interface SessionSummary {
  asked: number;
  firstAttemptCorrect: number;
  retries: number;
  passes: number;
  avgResponseMs: number | null;
  byTopic: TopicSummary[];
  missed: QuestionRecord[];
}

export function newRecord(question: Question): QuestionRecord {
  return { question, firstAttemptCorrect: null, attempts: 0, passed: false, responseTimeMs: null, answers: [], finalCorrect: false };
}

export function summarize(history: QuestionRecord[]): SessionSummary {
  const byTopicMap = new Map<Topic, TopicSummary>();
  const topicTimes = new Map<Topic, number[]>();
  const times: number[] = [];
  let firstAttemptCorrect = 0;
  let retries = 0;
  let passes = 0;
  for (const r of history) {
    const topic = r.question.topic;
    const t = byTopicMap.get(topic) ?? {
      topic, label: TOPIC_LABELS[topic], asked: 0, firstAttemptCorrect: 0, retries: 0, passes: 0, avgResponseMs: null,
    };
    t.asked += 1;
    if (r.firstAttemptCorrect) {
      t.firstAttemptCorrect += 1;
      firstAttemptCorrect += 1;
    }
    if (r.attempts >= 2) {
      t.retries += 1;
      retries += 1;
    }
    if (r.passed) {
      t.passes += 1;
      passes += 1;
    }
    if (r.responseTimeMs !== null) {
      times.push(r.responseTimeMs);
      topicTimes.set(topic, [...(topicTimes.get(topic) ?? []), r.responseTimeMs]);
    }
    byTopicMap.set(topic, t);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const byTopic = [...byTopicMap.values()].map((t) => ({ ...t, avgResponseMs: mean(topicTimes.get(t.topic) ?? []) }));
  return {
    asked: history.length,
    firstAttemptCorrect,
    retries,
    passes,
    avgResponseMs: mean(times),
    byTopic,
    missed: history.filter((r) => !r.firstAttemptCorrect),
  };
}
