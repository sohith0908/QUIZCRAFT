const categoryIds = {
  programming: 18,
  science: 17,
  general: 9,
  history: 23,
  geography: 22,
};

/** Decode common HTML entities from Open Trivia DB payloads. */
export function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function normalizeTriviaItem(item, topicId, index, stamp = Date.now()) {
  const options = [item.correct_answer, ...item.incorrect_answers].map(decodeHtml);
  const category = decodeHtml(item.category);
  const correctAnswer = decodeHtml(item.correct_answer);

  return {
    id: `opentdb-${topicId}-${stamp}-${index}`,
    topic: topicId,
    subtopic: category,
    difficulty: item.difficulty,
    question: decodeHtml(item.question),
    options,
    correctAnswer,
    explanation: `Open Trivia DB · ${category}. The correct answer is ${correctAnswer}.`,
    source: "opentdb",
  };
}

async function fetchCategoryQuestions(topicId, difficulty, amount, signal) {
  const category = categoryIds[topicId];
  if (!category || amount < 1) return [];

  const params = new URLSearchParams({
    amount: String(Math.min(10, amount)),
    category: String(category),
    type: "multiple",
  });
  if (difficulty !== "mixed") params.set("difficulty", difficulty);

  const response = await fetch(`https://opentdb.com/api.php?${params}`, { signal });
  if (!response.ok) return [];

  const payload = await response.json();
  if (payload.response_code !== 0 || !Array.isArray(payload.results)) return [];

  const stamp = Date.now();
  return payload.results.map((item, index) =>
    normalizeTriviaItem(item, topicId, index, stamp)
  );
}

/**
 * Fetch optional Open Trivia DB questions.
 * For "all" topics, pulls from several categories and mixes the results.
 */
export async function fetchTriviaQuestions(topic, difficulty, count) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return [];
  }

  const target = Math.min(10, Math.max(4, count));
  const topicIds =
    topic === "all"
      ? shuffle(Object.keys(categoryIds)).slice(0, 3)
      : categoryIds[topic]
        ? [topic]
        : [];

  if (topicIds.length === 0) return [];

  const perCategory = Math.max(1, Math.ceil(target / topicIds.length));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const batches = await Promise.all(
      topicIds.map((topicId) =>
        fetchCategoryQuestions(topicId, difficulty, perCategory, controller.signal).catch(
          () => []
        )
      )
    );

    return shuffle(batches.flat()).slice(0, target);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
