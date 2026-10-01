const STORAGE_KEY = "quizcraft-v1";
const SETTINGS_KEY = "quizcraft-settings";
const emptyData = () => ({ history: [] });

export function loadStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyData();
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.history)) return emptyData();
    return parsed;
  } catch {
    return emptyData();
  }
}

/** Persist the user's last setup choices (topic, difficulty, length, timer). */
export function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : "all",
      difficulty: typeof parsed.difficulty === "string" ? parsed.difficulty : "easy",
      questionCount: Number.isInteger(Number(parsed.questionCount))
        ? Number(parsed.questionCount)
        : 5,
      timerMode: typeof parsed.timerMode === "string" ? parsed.timerMode : "timed",
    };
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        topic: settings.topic,
        difficulty: settings.difficulty,
        questionCount: Number(settings.questionCount),
        timerMode: settings.timerMode,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function saveResult(summary) {
  const data = loadStorage();
  const topicScores = {};
  summary.questions?.forEach((question, index) => {
    const topic = topicScores[question.topic] ??= { total: 0, correct: 0 };
    topic.total += 1;
    if (summary.answers[index]?.isCorrect) topic.correct += 1;
  });

  data.history.push({
    topic: summary.topic,
    difficulty: summary.difficulty,
    total: summary.total,
    correct: summary.correct,
    percentage: summary.percentage,
    elapsedSeconds: summary.elapsedSeconds,
    topicScores,
    completedAt: new Date().toISOString(),
  });
  data.history = data.history.slice(-100);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function getStats() {
  const history = loadStorage().history;
  const topicStats = {};

  history.forEach((item) => {
    const scores = Object.keys(item.topicScores ?? {}).length > 0
      ? Object.entries(item.topicScores).map(([topic, score]) => [
        topic,
        Math.round((score.correct / score.total) * 100),
      ])
      : [[item.topic, item.percentage]];
    scores.forEach(([topic, percentage]) => {
      const stats = topicStats[topic] ??= { attempts: 0, totalPercentage: 0, bestScore: 0 };
      stats.attempts += 1;
      stats.totalPercentage += percentage;
      stats.bestScore = Math.max(stats.bestScore, percentage);
    });
  });

  Object.values(topicStats).forEach((stats) => {
    stats.averageScore = Math.round(stats.totalPercentage / stats.attempts);
    delete stats.totalPercentage;
  });

  const dayKey = (date) => {
    const localDate = new Date(date);
    return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
  };
  const activityDays = [...new Set(history.map((item) => dayKey(item.completedAt)))].sort().reverse();
  const today = dayKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayKey(yesterdayDate);
  let streak = 0;

  if (activityDays[0] === today || activityDays[0] === yesterday) {
    let expected = activityDays[0];
    for (const day of activityDays) {
      if (day !== expected) break;
      streak += 1;
      const priorDate = new Date(`${expected}T00:00:00`);
      priorDate.setDate(priorDate.getDate() - 1);
      expected = dayKey(priorDate);
    }
  }

  return {
    quizCount: history.length,
    bestScore: history.length ? Math.max(...history.map((item) => item.percentage)) : null,
    history,
    topicStats,
    streak,
  };
}

export function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
