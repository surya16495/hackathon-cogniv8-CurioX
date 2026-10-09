// Turn onboarding answers into a Profile: one lite-model JSON call, with a
// rule-based fallback so onboarding always finishes, even offline.
import { z } from 'zod';
import { KNOWLEDGE_LEVELS, type KnowledgeLevel, type OnboardingStepKey, type Profile } from '@lumora/shared';
import { PROFILE_EXTRACTION_PROMPT } from '../../prompts/onboarding';
import type { LlmService } from '../llm';
import { truncate } from '../../utils/async';

export interface OnboardingAnswer {
  key: OnboardingStepKey;
  question: string;
  answer: string;
}

const MAX_ITEMS = 10;
const MAX_CHARS = 100;

const cleanList = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? splitList(v) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const s = truncate(item.trim().replace(/\s+/g, ' '), MAX_CHARS);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
};

const cleanText = (v: unknown, max = 300): string => (typeof v === 'string' ? truncate(v.trim().replace(/\s+/g, ' '), max) : '');

/** Lenient coercion of anything profile-shaped into a valid Profile. Never throws. */
export function sanitizeProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const levels: Profile['knowledgeLevels'] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.knowledgeLevels)) {
    for (const k of r.knowledgeLevels) {
      if (!k || typeof k !== 'object') continue;
      const topic = cleanText((k as { topic?: unknown }).topic, MAX_CHARS);
      const level = String((k as { level?: unknown }).level ?? '').toLowerCase();
      if (!topic || seen.has(topic.toLowerCase())) continue;
      seen.add(topic.toLowerCase());
      levels.push({ topic, level: (KNOWLEDGE_LEVELS as readonly string[]).includes(level) ? (level as KnowledgeLevel) : 'beginner' });
      if (levels.length >= MAX_ITEMS) break;
    }
  }
  return {
    interests: cleanList(r.interests),
    knowledgeLevels: levels,
    goals: cleanList(r.goals),
    explanationStyle: cleanText(r.explanationStyle),
    tone: cleanText(r.tone, 200),
    curiosities: cleanList(r.curiosities),
  };
}

export function splitList(text: string): string[] {
  return text
    .split(/,|;|\n|\band\b|&|\//i)
    .map((s) => s.replace(/^[\s\-*•.]+|[\s.!]+$/g, '').trim())
    .filter((s) => s.length > 1);
}

/** Questions contain "and" and commas, so split them only on line breaks, ";" and after "?". */
export function splitQuestions(text: string): string[] {
  return text
    .split(/\n|;|(?<=\?)\s+/)
    .map((s) => s.replace(/^[\s\-*•.]+|[\s.!]+$/g, '').trim())
    .filter((s) => s.length > 1);
}

export function detectLevel(text: string): KnowledgeLevel {
  const t = text.toLowerCase();
  if (/\b(advanced|expert|pro|professional|deep|a lot|very familiar)\b/.test(t)) return 'advanced';
  if (/\b(intermediate|middle|some|decent|okay|ok|moderate|bit of|familiar)\b/.test(t)) return 'intermediate';
  return 'beginner';
}

/** Rule-based extraction used when no model is available. */
export function heuristicProfile(answers: OnboardingAnswer[]): Profile {
  const get = (key: OnboardingStepKey) => answers.find((a) => a.key === key)?.answer?.trim() ?? '';
  const interests = cleanList(get('interests'));
  const levelAnswer = get('knowledgeLevels');
  return sanitizeProfile({
    interests,
    knowledgeLevels: levelAnswer ? interests.map((topic) => ({ topic, level: detectLevel(levelAnswer) })) : [],
    goals: get('goals'),
    explanationStyle: get('explanationStyle'),
    tone: get('tone'),
    curiosities: splitQuestions(get('curiosities')),
  });
}

const looseProfileSchema = z.record(z.unknown());

export async function extractProfile(answers: OnboardingAnswer[], llm: LlmService): Promise<Profile> {
  const answered = answers.filter((a) => a.answer.trim());
  if (!answered.length) return sanitizeProfile({});

  const transcript = answered.map((a) => `Lumora: ${a.question}\nLearner: ${a.answer}`).join('\n\n');
  const { data, provider } = await llm.completeJson(
    { system: PROFILE_EXTRACTION_PROMPT, messages: [{ role: 'user', content: transcript }], temperature: 0.1 },
    looseProfileSchema,
    () => heuristicProfile(answers),
  );
  const profile = sanitizeProfile(data);

  // A model that returned valid JSON but dropped everything is worse than the rules.
  const empty = !profile.interests.length && !profile.goals.length && !profile.curiosities.length;
  return provider !== 'demo' && empty ? heuristicProfile(answers) : profile;
}
