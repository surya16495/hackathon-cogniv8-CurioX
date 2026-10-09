// Talk mode and teach-it-back: short, spoken-style replies in the companion's own voice.
import { z } from 'zod';
import { talkPointSchema, type Profile, type TalkResponse, type TeachResponse } from '@curiox/shared';
import { CURIOX_PERSONA, SPOKEN_STYLE, profileSummary } from '../../prompts/persona';
import { truncate } from '../../utils/async';
import type { LlmMessage, LlmService } from '../llm';

const TALK_FORMAT = `Reply with JSON only: {"points": [{"h": string, "say": string}]}
- 2 to 4 points that together answer the learner. The first point answers the question straight away.
- "say" is what you say out loud for that point: one or two short spoken sentences, max 200 characters.
- "h" is a 2 to 5 word heading for the point, like a sticky note: "Fewer dials, faster words".
- Sound like a friend chatting, not a lecturer: open the first point naturally ("Okay, so…", "Here's the thing:", "Short answer:"), use one everyday analogy, and explain any jargon in the same breath ("parameters, basically the dials it tunes").`;

const talkSchema = z.object({ points: z.array(talkPointSchema).min(1).max(5) });

export async function talk(message: string, history: LlmMessage[], profile: Profile, llm: LlmService): Promise<TalkResponse> {
  const { data, provider } = await llm.completeJson(
    {
      system: [CURIOX_PERSONA, SPOKEN_STYLE, `LEARNER PROFILE:\n${profileSummary(profile)}`, TALK_FORMAT].join('\n\n'),
      messages: [...history.slice(-8), { role: 'user', content: message }],
      tier: 'main',
      temperature: 0.8,
      maxOutputTokens: 1500,
      timeoutMs: 20_000,
    },
    talkSchema,
    () => ({
      points: [
        { h: 'I am offline', say: `I can't reach my AI brain right now, so I can't answer "${truncate(message, 80)}" properly.` },
        { h: 'Try again soon', say: 'Give it a minute and ask me again. I will be right here.' },
      ],
    }),
  );
  const points = data.points.slice(0, 4);
  return { reply: points.map((p) => p.say).join(' '), points, provider };
}

const TEACH_PROMPT = `You are CurioX, a friendly, encouraging learning buddy. The learner just tried to explain an idea in their own words.
Mark it kindly and honestly. Reply with JSON only:
{"verdict": "got_it" | "nearly" | "not_yet", "feedback": string, "add": string}
- "feedback": one short, warm sentence in a casual voice, max 90 characters. Say what they got right.
- "add": the single most useful thing to add or fix, max 100 characters, starts lower case, no full stop.
Use "got_it" when the main idea is right, even if worded loosely.`;

const teachSchema = z.object({
  verdict: z.enum(['got_it', 'nearly', 'not_yet']),
  feedback: z.string().trim().min(1).max(160),
  add: z.string().trim().min(1).max(160),
});

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** Without a model: how much of the model answer's vocabulary the learner used. */
export function roughMark(said: string, sample: string): TeachResponse['verdict'] {
  const want = words(sample);
  if (!want.size) return 'nearly';
  const got = words(said);
  const hit = [...want].filter((w) => got.has(w)).length / want.size;
  return hit >= 0.4 ? 'got_it' : hit >= 0.15 ? 'nearly' : 'not_yet';
}

export async function teachBack(input: { q: string; said: string; sample?: string }, llm: LlmService): Promise<TeachResponse> {
  const { data, provider } = await llm.completeJson(
    {
      system: TEACH_PROMPT,
      messages: [{ role: 'user', content: `Question: ${input.q}\n${input.sample ? `A good answer: ${input.sample}\n` : ''}Learner said: ${input.said}` }],
      temperature: 0.4,
      maxOutputTokens: 600,
      timeoutMs: 10_000,
    },
    teachSchema,
    () => {
      const verdict = input.sample ? roughMark(input.said, input.sample) : 'nearly';
      return {
        verdict,
        feedback: verdict === 'got_it' ? 'You have the main idea.' : verdict === 'nearly' ? 'You are close.' : 'Good try. Have another look.',
        add: input.sample ? `compare it with: ${truncate(input.sample, 80)}` : 'add one example to make it stick',
      };
    },
  );
  return { ...data, add: data.add.replace(/[.\s]+$/, ''), provider };
}
