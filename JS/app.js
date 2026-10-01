import { topics, questions } from "./questions.js";

import {
  getAvailableQuestions,
  createQuiz,
  getCurrentQuestion,
  hasAnsweredCurrent,
  answerQuestion,
  advanceQuestion,
  getElapsedSeconds,
  getQuizSummary,
  TIMER_SECONDS,
} from "./quiz.js";

import { getStats, saveResult, resetProgress } from "./storage.js";
import { fetchTriviaQuestions } from "./trivia.js";

const $ = (selector) => document.querySelector(selector);

const screens = {
  home: $("#home-screen"),
  setup: $("#setup-screen"),
  quiz: $("#quiz-screen"),
  results: $("#results-screen"),
};

const topicGrid = $("#topic-grid");
const homeTopicGrid = $("#home-topic-grid");
const setupForm = $("#setup-form");
const countSelect = $("#question-count");
const availability = $("#question-availability");
const setupError = $("#setup-error");

let selectedTopic = "all";
let quizState = null;
let timerInterval = null;
let timerDeadline = null;
let timerPaused = false;
let lastSettings = null;

const topicIcons = {
  all: "◈",
  programming: "</>",
  science: "✳",
  general: "◎",
  history: "⌛",
  geography: "⌖",
};

const difficultyNames = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  mixed: "Mixed",
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    if (screen) {
      screen.classList.toggle("hidden", key !== name);
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateHomeStats() {
  const stats = getStats();

  $("#home-best-score").textContent =
    stats.bestScore === null ? "—" : `${stats.bestScore}%`;

  $("#home-quiz-count").textContent = stats.quizCount;
  $("#home-topic-count").textContent = topics.length;
  $("#home-streak").textContent = `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`;

  const performance = $("#topic-performance");
  performance.replaceChildren();
  topics.forEach((topic) => {
    const topicStat = stats.topicStats[topic.id];
    const row = document.createElement("div");
    row.className = "topic-performance-row";
    const name = document.createElement("strong");
    name.textContent = topic.name;
    const score = document.createElement("span");
    score.textContent = topicStat
      ? `Best ${topicStat.bestScore}% · Average ${topicStat.averageScore}% · ${topicStat.attempts} ${topicStat.attempts === 1 ? "quiz" : "quizzes"}`
      : "No quizzes yet";
    row.append(name, score);
    performance.append(row);
  });

  const recentHistory = $("#recent-history");
  recentHistory.replaceChildren();
  const topicNames = Object.fromEntries(topics.map((topic) => [topic.id, topic.name]));
  stats.history.slice(-5).reverse().forEach((item) => {
    const row = document.createElement("li");
    const date = document.createElement("time");
    date.dateTime = item.completedAt;
    date.textContent = new Date(item.completedAt).toLocaleDateString();
    const label = document.createElement("span");
    label.textContent = `${topicNames[item.topic] ?? (item.topic === "all" ? "All topics" : item.topic)} · ${item.correct}/${item.total}`;
    const score = document.createElement("strong");
    score.textContent = `${item.percentage}%`;
    row.append(date, label, score);
    recentHistory.append(row);
  });

  if (stats.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "Your completed quizzes will appear here.";
    recentHistory.append(empty);
  }
}

function renderHomeTopics() {
  homeTopicGrid.replaceChildren();
  topics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `home-topic-card topic-${topic.id}`;
    button.setAttribute("aria-label", `Start a ${topic.name} quiz`);
    const icon = document.createElement("span");
    icon.className = "home-topic-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = topic.icon;
    const name = document.createElement("strong");
    name.textContent = topic.name;
    const description = document.createElement("span");
    description.textContent = topic.description;
    button.append(icon, name, description);
    button.addEventListener("click", () => {
      selectedTopic = topic.id;
      renderTopics();
      updateAvailableCounts();
      showScreen("setup");
    });
    homeTopicGrid.append(button);
  });
}

function renderTopics() {
  topicGrid.replaceChildren();

  const setupTopics = [
    { id: "all", name: "All topics", icon: "◈", description: "A mixed quiz from every subject" },
    ...topics,
  ];

  setupTopics.forEach((topic) => {
    const label = document.createElement("label");
    label.className = "topic-card";
    label.classList.toggle("selected", topic.id === selectedTopic);

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "topic";
    radio.value = topic.id;
    radio.checked = topic.id === selectedTopic;
    radio.setAttribute("aria-label", topic.name);

    const icon = document.createElement("span");
    icon.className = "topic-icon";
    icon.textContent = topicIcons[topic.id] ?? "✳";
    icon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "topic-name";
    name.textContent = topic.name;

    const description = document.createElement("span");
    description.className = "topic-meta";
    description.textContent = topic.description;

    label.append(radio, icon, name, description);
    topicGrid.append(label);

    radio.addEventListener("change", () => {
      selectedTopic = topic.id;
      renderTopics();
      updateAvailableCounts();
    });
  });
}

function getSelectedDifficulty() {
  return $('input[name="difficulty"]:checked')?.value ?? "easy";
}

function updateAvailableCounts() {
  const difficulty = getSelectedDifficulty();
  const pool = getAvailableQuestions(selectedTopic, difficulty);
  const availableCount = pool.length;
  const previousCount = Number(countSelect.value);

  // Allow users to choose any number from 4 to the available total.
  const choices = [];

  for (let count = 4; count <= availableCount; count++) {
    choices.push(count);
  }

  countSelect.replaceChildren();

  if (choices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Not enough questions available";
    countSelect.append(option);
    countSelect.value = "";
  } else {
    choices.forEach((count) => {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = `${count} questions`;
      countSelect.append(option);
    });

    // Preserve the previous selection if it is still available.
    const preferredCount = choices.includes(previousCount)
      ? previousCount
      : 4;

    countSelect.value = String(preferredCount);
  }

  if (availableCount < 4) {
    availability.textContent =
      `Only ${availableCount} questions are available for this selection. ` +
      "At least 4 questions are required.";
  } else {
    availability.textContent =
      `${availableCount} questions available for this selection. ` +
      `Choose between 4 and ${availableCount} questions.`;
  }
}

async function startQuiz(settings, questionIds = null, questionPool = null) {
  stopTimer();

  const pool = getAvailableQuestions(settings.topic, settings.difficulty, questionPool ?? questions);
  const eligibleQuestions = questionIds
    ? pool.filter((question) => questionIds.includes(question.id))
    : pool;
  const questionCount = Number(settings.questionCount);
  const minimumQuestionCount = settings.minimumQuestionCount ?? 4;

  if (
    !settings.topic ||
    !Number.isInteger(questionCount) ||
    questionCount < minimumQuestionCount ||
    eligibleQuestions.length < questionCount
  ) {
    setupError.textContent =
      "Please select at least 4 questions, and make sure enough questions are available.";
    showScreen("setup");
    return;
  }

  const quizSettings = { ...settings, questionCount };
  lastSettings = { ...quizSettings };
  const submitButton = setupForm.querySelector("[type='submit']");
  submitButton.disabled = true;
  setupError.textContent = "";
  if (!questionIds) {
    availability.textContent = "Checking for extra questions online. Your local question bank is ready either way.";
  }

  let onlineQuestions = [];
  if (!questionIds) {
    onlineQuestions = await fetchTriviaQuestions(
      quizSettings.topic,
      quizSettings.difficulty,
      quizSettings.questionCount
    );
    updateAvailableCounts();
  }

  const quizQuestionPool = questionPool ?? [...questions, ...onlineQuestions];
  quizState = createQuiz({
    ...quizSettings,
    questionPool: quizQuestionPool,
    questionIds,
  });
  submitButton.disabled = false;

  if (quizState.questions.length !== questionCount) {
    setupError.textContent = "The quiz could not be created. Please try again.";
    quizState = null;
    showScreen("setup");
    return;
  }

  setupError.textContent = "";
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  if (!quizState) return;

  stopTimer();

  const question = getCurrentQuestion(quizState);

  if (!question) {
    showResults();
    return;
  }

  const current = quizState.currentIndex + 1;
  const total = quizState.questions.length;
  const progress = Math.round(((current - 1) / total) * 100);

  $("#quiz-category-label").textContent =
    topics.find((topic) => topic.id === question.topic)?.name ??
    question.topic;

  $("#question-counter").textContent =
    `QUESTION ${String(current).padStart(2, "0")} / ` +
    String(total).padStart(2, "0");

  $("#difficulty-label").textContent =
    question.difficulty.toUpperCase();

  $("#question-topic").textContent = question.subtopic;
  $("#question-text").textContent = question.question;
  $("#question-text").setAttribute("tabindex", "-1");
  $("#question-text").focus({ preventScroll: true });
  $("#current-score").textContent = `SCORE: ${quizState.score}`;

  $("#progress-fill").style.width = `${progress}%`;
  $("#progress-track").setAttribute("aria-valuenow", String(progress));

  const answerList = $("#answer-list");
  answerList.replaceChildren();

  $("#answer-feedback").textContent = "";
  $("#answer-feedback").className = "answer-feedback";

  const nextButton = $("#next-button");
  nextButton.disabled = true;
  nextButton.innerHTML =
    current === total
      ? 'See results <span aria-hidden="true">→</span>'
      : 'Next question <span aria-hidden="true">→</span>';

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.textContent = String.fromCharCode(65 + index);
    letter.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "answer-text";
    text.textContent = option;

    button.append(letter, text);

    button.addEventListener("click", () => {
      selectAnswer(option);
    });

    answerList.append(button);
  });

  $("#timer-label").classList.remove("urgent");

  const timerMode = quizState.settings.timerMode;

  if (TIMER_SECONDS[timerMode] !== null) {
    quizState.remainingSeconds = TIMER_SECONDS[timerMode];
    timerPaused = false;
    $("#pause-timer-button").hidden = false;
    $("#pause-timer-button").textContent = "Pause timer";
    $("#skip-button").disabled = false;

    updateTimerLabel();
    startTimer();
  } else {
    quizState.remainingSeconds = null;
    $("#pause-timer-button").hidden = true;
    $("#skip-button").disabled = false;
    $("#timer-label").textContent = "NO TIMER";
  }
}

function updateTimerLabel() {
  if (!quizState || quizState.remainingSeconds === null) return;

  const label = $("#timer-label");
  label.textContent = `◷ ${quizState.remainingSeconds}s`;

  label.classList.toggle(
    "urgent",
    quizState.remainingSeconds <= 5
  );
}

function startTimer() {
  if (!quizState || quizState.remainingSeconds === null || timerPaused) return;
  timerDeadline = Date.now() + quizState.remainingSeconds * 1000;
  timerInterval = setInterval(() => {
    if (!quizState || hasAnsweredCurrent(quizState)) {
      stopTimer();
      return;
    }

    quizState.remainingSeconds = Math.max(
      0,
      Math.ceil((timerDeadline - Date.now()) / 1000)
    );
    updateTimerLabel();

    if (quizState.remainingSeconds <= 0) {
      stopTimer();
      selectAnswer(null);
    }
  }, 1000);
}

function toggleTimerPause() {
  if (!quizState || quizState.remainingSeconds === null || hasAnsweredCurrent(quizState)) return;

  if (timerPaused) {
    if (quizState.remainingSeconds <= 0) {
      timerPaused = false;
      selectAnswer(null);
      return;
    }
    timerPaused = false;
    $("#pause-timer-button").textContent = "Pause timer";
    startTimer();
  } else {
    quizState.remainingSeconds = Math.max(
      0,
      Math.ceil((timerDeadline - Date.now()) / 1000)
    );
    if (quizState.remainingSeconds <= 0) {
      selectAnswer(null);
      return;
    }
    timerPaused = true;
    stopTimer();
    updateTimerLabel();
    $("#pause-timer-button").textContent = "Resume timer";
  }
}

function selectAnswer(selectedOption, skipped = false) {
  if (!quizState || hasAnsweredCurrent(quizState)) return;

  stopTimer();

  answerQuestion(quizState, selectedOption);
  if (skipped) {
    quizState.answers[quizState.currentIndex].timedOut = false;
    quizState.answers[quizState.currentIndex].skipped = true;
  }

  const question = getCurrentQuestion(quizState);
  const result = quizState.answers[quizState.currentIndex];
  const feedback = $("#answer-feedback");

  $("#answer-list").querySelectorAll("button").forEach((button) => {
    button.disabled = true;

    const option = button.querySelector(".answer-text").textContent;

    if (option === question.correctAnswer) {
      button.classList.add("correct");
      const mark = document.createElement("span");
      mark.className = "answer-mark";
      mark.setAttribute("aria-label", "Correct answer");
      mark.textContent = "✓";
      button.append(mark);
    }

    if (option === selectedOption && !result.isCorrect) {
      button.classList.add("incorrect");
      const mark = document.createElement("span");
      mark.className = "answer-mark";
      mark.setAttribute("aria-label", "Incorrect answer");
      mark.textContent = "✕";
      button.append(mark);
    }
  });

  if (result.isCorrect) {
    feedback.textContent = `Correct! ${question.explanation}`;
    feedback.classList.add("correct-text");
  } else if (result.skipped) {
    feedback.textContent = `Skipped. The correct answer is ${question.correctAnswer}. ${question.explanation}`;
    feedback.classList.add("incorrect-text");
  } else if (result.timedOut) {
    feedback.textContent =
      `Time's up. The correct answer is ${question.correctAnswer}. ` +
      question.explanation;
    feedback.classList.add("incorrect-text");
  } else {
    feedback.textContent =
      `Not quite. The correct answer is ${question.correctAnswer}. ` +
      question.explanation;
    feedback.classList.add("incorrect-text");
  }

  $("#current-score").textContent = `SCORE: ${quizState.score}`;
  $("#next-button").disabled = false;
  $("#skip-button").disabled = true;
  $("#pause-timer-button").hidden = true;
}

function nextQuestion() {
  if (!quizState || !hasAnsweredCurrent(quizState)) {
    return;
  }

  const isFinished = advanceQuestion(quizState);

  if (isFinished || quizState.finished) {
    showResults();
  } else {
    renderQuestion();
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function showResults() {
  stopTimer();

  if (!quizState) return;

  const summary = getQuizSummary(quizState);

  saveResult(summary);

  $(".score-ring").style.setProperty("--score", `${summary.percentage}%`);
  $("#results-percentage").textContent = summary.percentage;
  $("#results-fraction").textContent =
    `${summary.correct} out of ${summary.total} correct`;
  $("#results-correct").textContent = summary.correct;
  $("#results-incorrect").textContent = summary.incorrect;

  $("#results-time").textContent =
    formatTime(summary.elapsedSeconds);

  $("#results-difficulty").textContent =
    difficultyNames[summary.difficulty] ?? summary.difficulty;
  const topicName = summary.topic === "all"
    ? "All topics"
    : topics.find((topic) => topic.id === summary.topic)?.name ?? summary.topic;
  $("#results-topic").textContent = topicName;
  $("#results-sidebar-difficulty").textContent =
    difficultyNames[summary.difficulty] ?? summary.difficulty;
  $("#results-total").textContent = summary.total;
  $("#results-sidebar-time").textContent = formatTime(summary.elapsedSeconds);

  $("#results-title").textContent =
    summary.percentage === 100
      ? "Flawless work."
      : summary.percentage >= 70
        ? "Well played."
        : "Keep building.";

  $("#results-subtitle").textContent =
    `You completed ${summary.total} questions. ` +
    "Take a look at what you learned.";

  $("#progress-fill").style.width = "100%";

  const reviewList = $("#review-list");
  reviewList.replaceChildren();

  summary.questions.forEach((question, index) => {
    const answer = summary.answers[index];

    const card = document.createElement("article");
    card.className = "review-card";
    card.dataset.correct = String(Boolean(answer?.isCorrect));

    const topLine = document.createElement("div");
    topLine.className = "review-topline";

    const number = document.createElement("span");
    number.textContent =
      `QUESTION ${String(index + 1).padStart(2, "0")}`;

    const status = document.createElement("span");
    status.className = answer?.isCorrect
      ? "review-status correct-text"
      : "review-status incorrect-text";

    status.textContent = answer?.isCorrect
      ? "✓ CORRECT"
      : answer?.timedOut
        ? "✕ TIME'S UP"
        : answer?.skipped
          ? "✕ SKIPPED"
          : "✕ INCORRECT";

    topLine.append(number, status);

    const questionText = document.createElement("p");
    questionText.className = "review-question";
    questionText.textContent = question.question;

    const yourAnswer = document.createElement("p");
    yourAnswer.className = "review-answer";
    yourAnswer.textContent =
      `Your answer: ${answer?.skipped ? "Skipped" : answer?.selectedAnswer ?? "No answer"}`;


    const correctAnswer = document.createElement("p");
    correctAnswer.className = "review-answer";

    const correctLabel = document.createElement("strong");
    correctLabel.textContent = "Correct answer: ";

    correctAnswer.append(
      correctLabel,
      document.createTextNode(question.correctAnswer)
    );

    const explanation = document.createElement("p");
    explanation.className = "review-explanation";
    explanation.textContent = question.explanation;

    card.append(
      topLine,
      questionText,
      yourAnswer,
      correctAnswer,
      explanation
    );

    reviewList.append(card);
  });

  $("#mistakes-only").checked = false;
  $("#retry-wrong-button").disabled = summary.incorrect === 0;
  $("#share-status").textContent = "";
  updateHomeStats();
  showScreen("results");
}

// Navigation
$("#start-button").addEventListener("click", () => {
  setupError.textContent = "";
  updateAvailableCounts();
  showScreen("setup");
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    stopTimer();
    if (button.dataset.go === "setup") updateAvailableCounts();
    showScreen(button.dataset.go);
  });
});

// Update available question counts when the difficulty changes.
setupForm.addEventListener("change", (event) => {
  if (event.target.name === "difficulty") {
    updateAvailableCounts();
  }
});

// Start the quiz using the exact number selected by the user.
setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setupError.textContent = "";

  const difficulty = getSelectedDifficulty();
  const selectedCount = Number(countSelect.value);

  const settings = {
    topic: selectedTopic,
    difficulty,
    questionCount: selectedCount,
    timerMode: $("#timer-mode").value || "timed",
  };

  startQuiz(settings);
});

$("#next-button").addEventListener("click", nextQuestion);
$("#skip-button").addEventListener("click", () => selectAnswer(null, true));
$("#pause-timer-button").addEventListener("click", toggleTimerPause);

$("#mistakes-only").addEventListener("change", (event) => {
  $("#review-list").querySelectorAll(".review-card").forEach((card) => {
    card.hidden = event.target.checked && card.dataset.correct === "true";
  });
});

$("#quit-button").addEventListener("click", () => {
  const shouldExit = window.confirm(
    "Exit this quiz? Your current session will not be saved."
  );

  if (shouldExit) {
    stopTimer();
    quizState = null;
    updateHomeStats();
    showScreen("home");
  }
});

$("#retry-button").addEventListener("click", () => {
  if (lastSettings) {
    startQuiz(lastSettings);
  }
});

$("#retry-wrong-button").addEventListener("click", () => {
  if (!quizState || !lastSettings) return;
  const wrongIds = quizState.answers
    .filter((answer) => !answer?.isCorrect)
    .map((answer) => answer.questionId);
  if (wrongIds.length === 0) return;

  startQuiz(
    { ...lastSettings, questionCount: wrongIds.length, minimumQuestionCount: 1 },
    wrongIds,
    quizState.questions
  );
});

$("#share-score-button").addEventListener("click", async () => {
  if (!quizState) return;
  const summary = getQuizSummary(quizState);
  const topicName = summary.topic === "all"
    ? "All topics"
    : topics.find((topic) => topic.id === summary.topic)?.name ?? summary.topic;
  const shareText = `I scored ${summary.percentage}% (${summary.correct}/${summary.total}) on a ${topicName} QuizCraft quiz!`;
  const status = $("#share-status");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
    } else {
      const input = document.createElement("textarea");
      input.value = shareText;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    status.textContent = "Score copied to clipboard.";
  } catch {
    status.textContent = "Could not copy the score on this device.";
  }
});

$("#reset-progress-button").addEventListener("click", () => {
  if (!window.confirm("Reset all saved quiz history and scores? This cannot be undone.")) return;
  resetProgress();
  updateHomeStats();
});

$("#theme-toggle").addEventListener("click", (event) => {
  const isDark = document.body.classList.toggle("dark-mode");
  event.currentTarget.setAttribute("aria-pressed", String(isDark));
  event.currentTarget.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  try {
    localStorage.setItem("quizcraft-theme", isDark ? "dark" : "light");
  } catch {
    // The theme still works for this page even when storage is unavailable.
  }
});

$("#results-retry-shortcut").addEventListener("click", () => $("#retry-button").click());
$("#results-home-shortcut").addEventListener("click", () => $("#home-button").click());

$("#home-button").addEventListener("click", () => {
  stopTimer();
  quizState = null;
  updateHomeStats();
  showScreen("home");
});

// Keyboard shortcuts: 1–4 select answers; Enter advances.
document.addEventListener("keydown", (event) => {
  if (screens.quiz.classList.contains("hidden")) return;
  if (!quizState) return;

  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      document.activeElement?.tagName
    )
  ) {
    return;
  }

  if (!hasAnsweredCurrent(quizState) && /^[1-4]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const option = getCurrentQuestion(quizState)?.options[index];

    if (option !== undefined) {
      selectAnswer(option);
    }
  } else if (
    event.key === "Enter" &&
    hasAnsweredCurrent(quizState) &&
    !$("#next-button").disabled
  ) {
    nextQuestion();
  }
});

// Initialize
renderTopics();
renderHomeTopics();
updateAvailableCounts();
updateHomeStats();
try {
  const prefersDark = localStorage.getItem("quizcraft-theme") === "dark";
  document.body.classList.toggle("dark-mode", prefersDark);
  $("#theme-toggle").setAttribute("aria-pressed", String(prefersDark));
  $("#theme-toggle").setAttribute("aria-label", `Switch to ${prefersDark ? "light" : "dark"} mode`);
} catch {
  // Keep the default light theme when browser storage is unavailable.
}
showScreen("home");