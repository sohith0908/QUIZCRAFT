import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStats,
  loadSettings,
  resetProgress,
  saveResult,
  saveSettings,
} from "../JS/storage.js";

function mockStorage() {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  });
  return store;
}

beforeEach(() => {
  mockStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("storage settings", () => {
  it("saves and restores setup preferences with defaults for bad values", () => {
    expect(loadSettings()).toBeNull();

    saveSettings({
      topic: "science",
      difficulty: "hard",
      questionCount: 8,
      timerMode: "timed-60",
    });

    expect(loadSettings()).toEqual({
      topic: "science",
      difficulty: "hard",
      questionCount: 8,
      timerMode: "timed-60",
    });
  });
});

describe("storage progress", () => {
  it("tracks quiz history, best score, and topic averages", () => {
    saveResult({
      topic: "programming",
      difficulty: "easy",
      total: 5,
      correct: 4,
      percentage: 80,
      elapsedSeconds: 40,
      questions: [
        { topic: "programming" },
        { topic: "programming" },
        { topic: "programming" },
        { topic: "programming" },
        { topic: "programming" },
      ],
      answers: [
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
      ],
    });

    const stats = getStats();
    expect(stats.quizCount).toBe(1);
    expect(stats.bestScore).toBe(80);
    expect(stats.topicStats.programming).toMatchObject({
      attempts: 1,
      bestScore: 80,
      averageScore: 80,
    });
  });

  it("counts a streak for consecutive local activity days", () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const makeResult = (date) => ({
      topic: "general",
      difficulty: "easy",
      total: 4,
      correct: 3,
      percentage: 75,
      elapsedSeconds: 20,
      questions: [{ topic: "general" }],
      answers: [{ isCorrect: true }],
      completedAt: date.toISOString(),
    });

    // saveResult stamps completedAt itself — seed storage directly for streak dates.
    localStorage.setItem(
      "quizcraft-v1",
      JSON.stringify({
        history: [
          { ...makeResult(yesterday), completedAt: yesterday.toISOString() },
          { ...makeResult(today), completedAt: today.toISOString() },
        ],
      })
    );

    expect(getStats().streak).toBe(2);
  });

  it("clears progress history", () => {
    saveResult({
      topic: "history",
      difficulty: "medium",
      total: 4,
      correct: 2,
      percentage: 50,
      elapsedSeconds: 15,
      questions: [{ topic: "history" }],
      answers: [{ isCorrect: false }],
    });

    expect(resetProgress()).toBe(true);
    expect(getStats().quizCount).toBe(0);
    expect(getStats().bestScore).toBeNull();
  });
});
