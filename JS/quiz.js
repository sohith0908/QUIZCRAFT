
import { questions } from "./questions.js";

export const TIMER_SECONDS = {
  timed: 30,
  "timed-60": 60,
  untimed: null,
};

// Shuffle questions randomly without changing the original array.
function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// Get questions matching the selected topic and difficulty.
export function getAvailableQuestions(topic, difficulty, questionPool = questions) {
  return questionPool.filter((question) => {
    const matchesTopic = topic === "all" || question.topic === topic;

    const matchesDifficulty =
      difficulty === "mixed" ||
      question.difficulty === difficulty;

    return matchesTopic && matchesDifficulty;
  });
}

// Create a quiz containing exactly the number of questions selected.
export function createQuiz({
  topic,
  difficulty,
  questionCount,
  timerMode = "timed",
  questionPool = questions,
  questionIds = null,
}) {
  const availableQuestions = getAvailableQuestions(
    topic,
    difficulty,
    questionPool
  );

  const count = Number(questionCount);
  const eligibleQuestions = questionIds
    ? availableQuestions.filter((question) => questionIds.includes(question.id))
    : availableQuestions;

  const selectedQuestions = shuffle(eligibleQuestions)
    .slice(0, count)
    .map((question) => ({
      ...question,
      options: shuffle(question.options),
    }));

  const now = Date.now();

  const settings = {
    topic,
    difficulty,
    questionCount: selectedQuestions.length,
    timerMode,
  };

  return {
    // Settings are used by app.js and the results summary.
    settings,

    // Keep these properties available for compatibility.
    topic,
    difficulty,
    timerMode,

    questions: selectedQuestions,
    currentIndex: 0,
    answers: [],
    score: 0,
    finished: selectedQuestions.length === 0,

    startedAt: now,
    questionStartedAt: now,

    remainingSeconds: TIMER_SECONDS[timerMode] ?? null,
  };
}

// Return the current question.
export function getCurrentQuestion(state) {
  return state.questions[state.currentIndex] ?? null;
}

// Check whether the current question has been answered.
export function hasAnsweredCurrent(state) {
  return state.answers[state.currentIndex] !== undefined;
}

// Save the user's answer and update the score.
export function answerQuestion(state, selectedAnswer) {
  if (state.finished || hasAnsweredCurrent(state)) {
    return false;
  }

  const question = getCurrentQuestion(state);

  if (!question) {
    return false;
  }

  const isCorrect =
    selectedAnswer === question.correctAnswer;

  state.answers[state.currentIndex] = {
    questionId: question.id,
    selectedAnswer,
    correctAnswer: question.correctAnswer,
    isCorrect,
    timedOut: selectedAnswer === null,
  };

  if (isCorrect) {
    state.score += 1;
  }

  return true;
}

// Move to the next question or finish the quiz.
export function advanceQuestion(state) {
  if (state.finished || !hasAnsweredCurrent(state)) {
    return false;
  }

  // Stop after the last question selected by the user.
  if (state.currentIndex >= state.questions.length - 1) {
    state.finished = true;
    return true;
  }

  state.currentIndex += 1;
  state.questionStartedAt = Date.now();

  // Reset the timer for the next question.
  state.remainingSeconds = TIMER_SECONDS[state.settings.timerMode] ?? null;

  return false;
}

// Calculate the total time spent on the quiz.
export function getElapsedSeconds(state) {
  return Math.max(
    0,
    Math.floor((Date.now() - state.startedAt) / 1000)
  );
}

// Generate the final quiz results.
export function getQuizSummary(state) {
  const total = state.questions.length;
  const correct = state.score;

  return {
    topic: state.settings.topic,
    difficulty: state.settings.difficulty,
    total,
    correct,
    incorrect: total - correct,

    percentage: total
      ? Math.round((correct / total) * 100)
      : 0,

    elapsedSeconds: getElapsedSeconds(state),
    answers: state.answers,
    questions: state.questions,
  };
}