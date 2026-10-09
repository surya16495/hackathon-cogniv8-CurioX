import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { extractJson } from '../src/utils/json';
import { formatSse, parseSse } from '../src/utils/sse';
import { toSources } from '../src/services/search';
import { normalizeQuery } from '../src/services/search/cache';
import { normalizeMessages } from '../src/services/llm/types';
import { heuristicRoute } from '../src/services/chat/router';
import { detectLevel, heuristicProfile, sanitizeProfile, splitList } from '../src/services/onboarding/extract';

describe('extractJson', () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Sure! {"a":{"b":[1,2]}} hope that helps', { a: { b: [1, 2] } }],
    ['[1,2]', [1, 2]],
  ])('parses %j', (input, expected) => expect(extractJson(input)).toEqual(expected));

  it('throws when there is no JSON', () => expect(() => extractJson('nope')).toThrow());
});

describe('SSE format', () => {
  it('round-trips data containing newlines and unicode', () => {
    const text = formatSse('token', { text: 'line1\nline2 “quoted” 🚀' }) + ': ping\n\n' + formatSse('done', { ok: true });
    expect(parseSse(text)).toEqual([
      { event: 'token', data: { text: 'line1\nline2 “quoted” 🚀' } },
      { event: 'done', data: { ok: true } },
    ]);
  });
});

describe('toSources', () => {
  it('keeps http(s) only, de-duplicates, renumbers, and caps the count', () => {
    const out = toSources(
      [
        { title: '', url: 'https://x.com/a', snippet: '' },
        { title: 'dup', url: 'https://x.com/a/', snippet: '' },
        { title: 'ftp', url: 'ftp://x.com', snippet: '' },
        { title: 'bad', url: 'not a url', snippet: '' },
        { title: 'b', url: 'http://y.com', snippet: '  lots   of   space ' },
        { title: 'c', url: 'https://z.com', snippet: '' },
      ],
      2,
    );
    expect(out).toEqual([
      { id: 1, title: 'x.com', url: 'https://x.com/a', snippet: '' },
      { id: 2, title: 'b', url: 'http://y.com/', snippet: 'lots of space' },
    ]);
  });

  it('normalizes queries for caching', () => expect(normalizeQuery('  Hello   WORLD ')).toBe('hello world'));
});

describe('normalizeMessages', () => {
  it('drops leading assistant turns, merges same-role turns and empties', () => {
    expect(
      normalizeMessages([
        { role: 'assistant', content: 'welcome' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: '  ' },
        { role: 'assistant', content: 'c' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ]);
  });

  it('never returns an empty list', () => expect(normalizeMessages([])).toHaveLength(1));
});

describe('heuristicRoute', () => {
  it.each([
    ['What is the latest iPhone?', true],
    ['Who won the match yesterday?', true],
    ['What happened in 2026?', true],
    ['Explain photosynthesis', false],
    ['What is a stock?', true], // accepted false positive: costs one cached search
  ])('%s -> %s', (msg, expected) => expect(heuristicRoute(msg).needsSearch).toBe(expected));
});

describe('profile extraction helpers', () => {
  it('splits lists on commas, "and", slashes and new lines', () => {
    expect(splitList('AI/ML, cooking and\nhistory.')).toEqual(['AI', 'ML', 'cooking', 'history']);
  });

  it('does not split words that contain "and"', () => {
    expect(splitList('understanding sandcastles')).toEqual(['understanding sandcastles']);
  });

  it.each([
    ['total beginner', 'beginner'],
    ['I know some basics', 'intermediate'],
    ["I'm pretty advanced", 'advanced'],
    ['', 'beginner'],
  ])('detectLevel(%j) = %s', (text, level) => expect(detectLevel(text)).toBe(level));

  it('sanitizeProfile survives junk', () => {
    expect(sanitizeProfile(null)).toEqual({ interests: [], knowledgeLevels: [], goals: [], explanationStyle: '', tone: '', curiosities: [] });
    const p = sanitizeProfile({
      interests: [1, 'A', 'a', 'x'.repeat(500), ...Array.from({ length: 20 }, (_, i) => `i${i}`)],
      knowledgeLevels: [{ topic: 'A', level: 'ADVANCED' }, { topic: 'a', level: 'beginner' }, 'junk', { level: 'beginner' }],
      tone: 42,
    });
    expect(p.interests).toHaveLength(10);
    expect(p.interests[1]!.length).toBeLessThanOrEqual(100);
    expect(p.knowledgeLevels).toEqual([{ topic: 'A', level: 'advanced' }]);
    expect(p.tone).toBe('');
  });

  it('heuristicProfile ignores skipped answers', () => {
    const p = heuristicProfile([
      { key: 'interests', question: 'q', answer: '' },
      { key: 'goals', question: 'q', answer: 'Get a job' },
    ]);
    expect(p.interests).toEqual([]);
    expect(p.knowledgeLevels).toEqual([]);
    expect(p.goals).toEqual(['Get a job']);
  });
});

describe('loadEnv', () => {
  it('requires MONGODB_URI', () => expect(() => loadEnv({})).toThrow(/MONGODB_URI/));

  it('applies defaults and parses lists and booleans', () => {
    const env = loadEnv({ MONGODB_URI: 'mongodb://x', DEMO_MODE: 'TRUE', CORS_ORIGIN: 'http://a.com/, http://b.com', GEMINI_API_KEY: '  ' });
    expect(env.PORT).toBe(4000);
    expect(env.DEMO_MODE).toBe(true);
    expect(env.CORS_ORIGIN).toEqual(['http://a.com', 'http://b.com']);
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL_MAIN).toBe('gemini-3.8-flash');
  });

  it('LLM_CHAT_ORDER ignores unknown names and never ends up empty', () => {
    expect(loadEnv({ MONGODB_URI: 'x', LLM_CHAT_ORDER: 'Groq, gemini, openai, groq' }).LLM_CHAT_ORDER).toEqual(['groq', 'gemini']);
    expect(loadEnv({ MONGODB_URI: 'x', LLM_CHAT_ORDER: 'typo' }).LLM_CHAT_ORDER).toEqual(['groq', 'gemini']);
    expect(loadEnv({ MONGODB_URI: 'x' }).LLM_CHAT_ORDER).toEqual(['groq', 'gemini']);
  });

  it('rejects a bad port', () => expect(() => loadEnv({ MONGODB_URI: 'x', PORT: 'abc' })).toThrow(/PORT/));
});


import { createKeyPool, isRateLimited, parseKeys } from '../src/services/llm/keys';

describe('API key pools', () => {
  it('parses one or many keys', () => {
    expect(parseKeys(undefined)).toEqual([]);
    expect(parseKeys('  ')).toEqual([]);
    expect(parseKeys('k1')).toEqual(['k1']);
    expect(parseKeys('k1, k2,k1 k3')).toEqual(['k1', 'k2', 'k3']);
  });

  it('recognises rate limits from either SDK', () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited(new Error('429 {"error":{"message":"Rate limit reached"}}'))).toBe(true);
    expect(isRateLimited(new Error('You exceeded your current quota'))).toBe(true);
    expect(isRateLimited(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isRateLimited(new Error('boom'))).toBe(false);
    expect(isRateLimited({ status: 500 })).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });

  it('rotates to the next key on a rate limit and stays there', () => {
    const pool = createKeyPool(['a', 'b', 'c'], (k) => ({ k }));
    expect(pool.size).toBe(3);
    const first = pool.current()!;
    expect(first.k).toBe('a');
    expect(pool.rotate(first, new Error('server exploded'))).toBe(false);
    expect(pool.current()!.k).toBe('a');
    expect(pool.rotate(first, { status: 429 })).toBe(true);
    expect(pool.current()!.k).toBe('b');
    // A late failure from the old key does not rotate again.
    expect(pool.rotate(first, { status: 429 })).toBe(true);
    expect(pool.current()!.k).toBe('b');
    expect(pool.rotate(pool.current()!, { status: 429 })).toBe(true);
    expect(pool.current()!.k).toBe('c');
    expect(pool.rotate(pool.current()!, { status: 429 })).toBe(true);
    expect(pool.current()!.k).toBe('a');
  });

  it('a single key never rotates; no key means unavailable', () => {
    const one = createKeyPool(['a'], (k) => ({ k }));
    expect(one.rotate(one.current()!, { status: 429 })).toBe(false);
    const none = createKeyPool([], (k) => ({ k }));
    expect(none.size).toBe(0);
    expect(none.current()).toBeNull();
  });
});
