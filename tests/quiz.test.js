import { afterEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, advanceQuestion, createQuiz, getAvailableQuestions, TIMER_SECONDS } from "../JS/quiz.js";

const sampleQuestion = {
  id: "test-1",
  topic: "programming",
  subtopic: "Testing",
  difficulty: "easy",
  question: "Which answer is correct?",
  options: ["A", "B", "C", "D"],
  correctAnswer: "B",
  explanation: "B is correct.",
};

afterEach(() => vi.restoreAllMocks());

describe("quiz helpers", () => {
  it("returns questions from every topic for an all-topics quiz", () => {
    const mixedPool = [
      sampleQuestion,
      { ...sampleQuestion, id: "test-2", topic: "science" },
    ];

    expect(getAvailableQuestions("all", "easy", mixedPool)).toHaveLength(2);
  });

  it("shuffles answer options without changing the correct answer", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const quiz = createQuiz({
      topic: "programming",
      difficulty: "easy",
      questionCount: 1,
      questionPool: [sampleQuestion],
    });

    expect(quiz.questions[0].options).not.toEqual(sampleQuestion.options);
    expect(quiz.questions[0].options).toContain(quiz.questions[0].correctAnswer);
    expect(sampleQuestion.options).toEqual(["A", "B", "C", "D"]);
  });

  it("scores answers and advances through a quiz", () => {
    const quiz = createQuiz({
      topic: "programming",
      difficulty: "easy",
      questionCount: 1,
      questionPool: [sampleQuestion],
    });

    expect(answerQuestion(quiz, "B")).toBe(true);
    expect(quiz.score).toBe(1);
    expect(advanceQuestion(quiz)).toBe(true);
    expect(quiz.finished).toBe(true);
  });

  it("uses one source for timer durations", () => {
    expect(TIMER_SECONDS).toEqual({ timed: 30, "timed-60": 60, untimed: null });
  });
});