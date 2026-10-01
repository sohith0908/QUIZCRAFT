const categoryIds = {
  programming: 18,
  science: 17,
  general: 9,
  history: 23,
  geography: 22,
};

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export async function fetchTriviaQuestions(topic, difficulty, count) {
  const topicId = topic === "all"
    ? Object.keys(categoryIds)[Math.floor(Math.random() * Object.keys(categoryIds).length)]
    : topic;
  const category = categoryIds[topicId];

  if (!category || navigator.onLine === false) return [];

  const params = new URLSearchParams({
    amount: String(Math.min(10, Math.max(4, count))),
    category: String(category),
    type: "multiple",
  });
  if (difficulty !== "mixed") params.set("difficulty", difficulty);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://opentdb.com/api.php?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = await response.json();
    if (payload.response_code !== 0 || !Array.isArray(payload.results)) return [];

    return payload.results.map((item, index) => {
      const options = [item.correct_answer, ...item.incorrect_answers].map(decodeHtml);
      return {
        id: `opentdb-${topicId}-${Date.now()}-${index}`,
        topic: topicId,
        subtopic: decodeHtml(item.category),
        difficulty: item.difficulty,
        question: decodeHtml(item.question),
        options,
        correctAnswer: decodeHtml(item.correct_answer),
        explanation: "This question was supplied by Open Trivia DB.",
      };
    });
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}