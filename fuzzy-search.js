/**
 * Lightweight fuzzy search for bill tracker fields.
 * Supports typos, partial matches, and multi-word queries (all tokens must match).
 */
const FuzzySearch = (() => {
  const DEFAULT_THRESHOLD = 0.55;

  function normalize(text) {
    return String(text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(" ") : [];
  }

  function levenshtein(a, b) {
    if (a === b) {
      return 0;
    }
    if (!a.length) {
      return b.length;
    }
    if (!b.length) {
      return a.length;
    }

    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (let row = 1; row < rows; row += 1) {
      matrix[row][0] = row;
    }
    for (let col = 1; col < cols; col += 1) {
      matrix[0][col] = col;
    }

    for (let row = 1; row < rows; row += 1) {
      for (let col = 1; col < cols; col += 1) {
        const cost = a[row - 1] === b[col - 1] ? 0 : 1;
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + cost,
        );
      }
    }

    return matrix[rows - 1][cols - 1];
  }

  function similarity(a, b) {
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) {
      return 0;
    }
    if (left === right) {
      return 1;
    }
    if (left.includes(right) || right.includes(left)) {
      const shorter = Math.min(left.length, right.length);
      const longer = Math.max(left.length, right.length);
      return 0.85 + (shorter / longer) * 0.15;
    }

    const distance = levenshtein(left, right);
    const maxLen = Math.max(left.length, right.length);
    return Math.max(0, 1 - distance / maxLen);
  }

  function subsequenceScore(query, target) {
    if (query.length > target.length || target.length > query.length + 3) {
      return 0;
    }

    let queryIndex = 0;
    let score = 0;
    let consecutive = 0;
    let lastMatch = -1;

    for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
      if (target[index] !== query[queryIndex]) {
        consecutive = 0;
        continue;
      }

      queryIndex += 1;
      consecutive += 1;
      score += consecutive;

      if (lastMatch >= 0 && index - lastMatch > 2) {
        score -= 0.35;
      }
      lastMatch = index;
    }

    if (queryIndex !== query.length) {
      return 0;
    }

    const coverage = queryIndex / query.length;
    const density = score / Math.max(target.length, 1);
    return coverage * 0.55 + Math.min(density * 4, 0.45);
  }

  function acronymScore(query, text) {
    if (query.length < 2 || query.length > 8) {
      return 0;
    }

    const words = tokenize(text).filter((word) => word.length > 1);
    if (words.length < query.length) {
      return 0;
    }

    const initials = words.map((word) => word[0]).join("");
    return similarity(query, initials);
  }

  function tokenThreshold(token) {
    if (token.length <= 2) {
      return 0.95;
    }
    if (token.length === 3) {
      return 0.75;
    }
    if (token.length <= 5) {
      return 0.62;
    }
    return DEFAULT_THRESHOLD;
  }

  function wordSimilarity(token, word) {
    if (word.startsWith(token)) {
      return 0.92;
    }

    if (Math.abs(word.length - token.length) > Math.max(2, Math.floor(token.length * 0.35))) {
      return 0;
    }

    const ratio = similarity(token, word);
    if (ratio >= 0.72) {
      return ratio;
    }

    if (word.length <= token.length + 3) {
      return subsequenceScore(token, word);
    }

    return 0;
  }

  function scoreTokenInText(token, text) {
    const normalizedToken = normalize(token);
    const normalizedText = normalize(text);

    if (!normalizedToken || !normalizedText) {
      return 0;
    }

    if (normalizedText.includes(normalizedToken)) {
      return 1;
    }

    const words = tokenize(normalizedText);
    let best = acronymScore(normalizedToken, normalizedText);

    for (const word of words) {
      best = Math.max(best, wordSimilarity(normalizedToken, word));
    }

    if (normalizedText.length <= normalizedToken.length + 8) {
      best = Math.max(best, similarity(normalizedToken, normalizedText));
    }

    return best;
  }

  function scoreQueryInText(query, text) {
    const tokens = tokenize(query);
    if (!tokens.length) {
      return 1;
    }

    let total = 0;

    for (const token of tokens) {
      const tokenScore = scoreTokenInText(token, text);
      if (tokenScore < tokenThreshold(token)) {
        return 0;
      }
      total += tokenScore;
    }

    return total / tokens.length;
  }

  function scoreQueryInFields(query, fields) {
    const values = fields.filter(Boolean).map(String);
    if (!values.length) {
      return 0;
    }

    return Math.max(...values.map((field) => scoreQueryInText(query, field)));
  }

  function matches(query, fields, threshold = DEFAULT_THRESHOLD) {
    if (!normalize(query)) {
      return true;
    }
    return scoreQueryInFields(query, fields) >= threshold;
  }

  return {
    DEFAULT_THRESHOLD,
    matches,
    scoreQueryInFields,
  };
})();
