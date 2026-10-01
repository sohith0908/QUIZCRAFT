import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeHtml,
  fetchTriviaQuestions,
  normalizeTriviaItem,
} from "../JS/trivia.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trivia helpers", () => {
  it("decodes common HTML entities from Open Trivia DB", () => {
    expect(decodeHtml("What is &quot;JSON&quot;?")).toBe('What is "JSON"?');
    expect(decodeHtml("It&#039;s easy &amp; fun")).toBe("It's easy & fun");
    expect(decodeHtml("A &lt; B &gt; C")).toBe("A < B > C");
  });

  it("normalizes an Open Trivia DB item into the local question shape", () => {
    const question = normalizeTriviaItem(
      {
        category: "Science: Computers",
        difficulty: "easy",
        question: "What does CPU stand for?",
        correct_answer: "Central Processing Unit",
        incorrect_answers: ["Computer Personal Unit", "Central Process Unit", "Control Process Unit"],
      },
      "programming",
      0,
      123
    );

    expect(question).toMatchObject({
      id: "opentdb-programming-123-0",
      topic: "programming",
      subtopic: "Science: Computers",
      difficulty: "easy",
      correctAnswer: "Central Processing Unit",
      source: "opentdb",
    });
    expect(question.options).toContain("Central Processing Unit");
    expect(question.options).toHaveLength(4);
    expect(question.explanation).toContain("Open Trivia DB");
  });

  it("returns an empty list when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(fetchTriviaQuestions("science", "easy", 5)).resolves.toEqual([]);
  });

  it("fetches and maps online questions for a single topic", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response_code: 0,
          results: [
            {
              category: "Science &amp; Nature",
              difficulty: "medium",
              question: "What is H&lt;sub&gt;2&lt;/sub&gt;O?",
              correct_answer: "Water",
              incorrect_answers: ["Oxygen", "Hydrogen", "Salt"],
            },
          ],
        }),
      }))
    );

    const questions = await fetchTriviaQuestions("science", "medium", 5);
    expect(fetch).toHaveBeenCalledOnce();
    expect(questions).toHaveLength(1);
    expect(questions[0].topic).toBe("science");
    expect(questions[0].correctAnswer).toBe("Water");
    expect(questions[0].subtopic).toBe("Science & Nature");
  });
});
