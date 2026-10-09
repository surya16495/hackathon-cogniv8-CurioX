import { createHash } from 'node:crypto';
import { z } from 'zod';
import { LIMITS, type Profile, type SuggestedTopic, type SuggestedTopicsResponse } from '@curiox/shared';
import { topicsPrompt } from '../../prompts/learn';
import { profileSummary } from '../../prompts/persona';
import type { LlmService } from '../llm';

const topicsSchema = z.object({
  topics: z
    .array(z.object({ title: z.string().trim().min(1).max(80), prompt: z.string().trim().min(1).max(200) }))
    .min(LIMITS.topicsMin),
});

const GENERIC: SuggestedTopic[] = [
  { title: 'How the internet works', prompt: 'How does a web page actually reach my phone?' },
  { title: 'Black holes', prompt: 'What really happens inside a black hole?' },
  { title: 'How memory works', prompt: 'Why do we forget things, and how can I remember better?' },
  { title: 'Compound interest', prompt: 'Why is compound interest called the eighth wonder of the world?' },
  { title: 'How AI chatbots work', prompt: 'How does an AI chatbot like you actually generate answers?' },
  { title: 'The placebo effect', prompt: 'How can a sugar pill make people feel better?' },
];

/** Fixed starter topics built from the profile: the cut-list fallback in the plan. */
export function fallbackTopics(profile: Profile): SuggestedTopic[] {
  const fromProfile: SuggestedTopic[] = [];
  for (const c of profile.curiosities.slice(0, 2)) {
    fromProfile.push({ title: c.slice(0, 60), prompt: c.endsWith('?') ? c : `Can you explain ${c}?` });
  }
  for (const i of profile.interests.slice(0, 4)) {
    fromProfile.push({ title: `${i}: the big ideas`, prompt: `What are the most important ideas in ${i}?` });
  }
  const seen = new Set<string>();
  const merged = [...fromProfile, ...GENERIC].filter((t) => {
    const k = t.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return merged.slice(0, LIMITS.topicsMax);
}

// Suggestions only change when the profile does, so cache them in memory for an hour.
const cache = new Map<string, { at: number; value: SuggestedTopicsResponse }>();
const TTL_MS = 3600_000;
const MAX_ENTRIES = 1000;

function cacheKey(userId: string, profile: Profile): string {
  return `${userId}:${createHash('sha1').update(JSON.stringify(profile)).digest('hex')}`;
}

export function clearTopicsCache(): void {
  cache.clear();
}

export async function suggestTopics(userId: string, profile: Profile, llm: LlmService): Promise<SuggestedTopicsResponse> {
  const key = cacheKey(userId, profile);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const hasProfile = profile.interests.length > 0 || profile.curiosities.length > 0;
  let value: SuggestedTopicsResponse;
  if (!hasProfile) {
    value = { topics: GENERIC.slice(0, LIMITS.topicsMax), provider: 'demo' };
  } else {
    const { data, provider } = await llm.completeJson(
      { system: topicsPrompt(LIMITS.topicsMin, LIMITS.topicsMax), messages: [{ role: 'user', content: profileSummary(profile) }], temperature: 0.9 },
      topicsSchema,
      () => ({ topics: fallbackTopics(profile) }),
    );
    value = { topics: data.topics.slice(0, LIMITS.topicsMax), provider };
  }

  // Do not cache a fallback: next time the model may be back.
  if (value.provider !== 'demo' || !hasProfile) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}
