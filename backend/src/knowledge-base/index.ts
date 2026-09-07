import type { ErrorCode, HelpTopic, Intent } from '@astan/contracts';
import { ARTICLES, type Article } from './articles.js';
import { normalizeDigits } from '../policy-engine/sanitizer.js';

export type { Article };
export { ARTICLES };

/** Strip Persian orthographic noise so keyword matching is forgiving. */
function normalize(text: string): string {
  return normalizeDigits(text)
    .replace(/[ىي]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/[؟?.!،,:;«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findByTopic(topic: HelpTopic): Article | null {
  return ARTICLES.find((a) => a.topics.includes(topic)) ?? null;
}

export function findByErrorCode(code: ErrorCode): Article | null {
  return ARTICLES.find((a) => a.error_codes.includes(code)) ?? null;
}

export function findByIntent(intent: Intent): Article | null {
  return ARTICLES.find((a) => a.intents.includes(intent)) ?? null;
}

/**
 * Lexical retrieval over the curated set. A BM25-ish scorer would be overkill
 * for nine articles; what matters is that retrieval is deterministic and
 * auditable, so a wrong answer can always be traced to a specific article.
 */
export function search(query: string, limit = 3): Article[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ').filter((t) => t.length > 2);
  const scored = ARTICLES.map((article) => {
    let score = 0;
    for (const kw of article.keywords) {
      const k = normalize(kw);
      if (q.includes(k)) score += k.split(' ').length * 3;
    }
    const haystack = normalize(`${article.title} ${article.body}`);
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
    return { article, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.article);
}

/** Compact grounding block handed to the LLM (سند §26). */
export function toPromptBlock(articles: Article[]): string {
  if (articles.length === 0) return 'هیچ مقاله مرتبطی یافت نشد.';
  return articles
    .map((a) => `### ${a.id} — ${a.title}\n${a.body}\nنسخه ساده: ${a.simple_body}`)
    .join('\n\n');
}
