// The chip onboarding: questions 2 to 6 follow the interests picked in question 1,
// and the finished reader card becomes the profile in one save.
import { z } from 'zod';
import { INTEREST_OPTIONS, profileFromReader, tailorQuestions, type ReaderCard, type TailorResponse } from '@curiox/shared';
import { User, type UserDoc } from '../../db/models';
import { notFound } from '../../utils/errors';
import type { LlmService } from '../llm';
import { sanitizeProfile } from './extract';
import { TOTAL_STEPS } from './steps';

const tailorSchema = z.object({
  regular: z.string().trim().min(2).max(40),
  goals: z.array(z.string().trim().min(2).max(48)).min(1).max(4),
  curious: z.array(z.string().trim().min(4).max(80)).min(3).max(6),
});

const TAILOR_PROMPT = `You help a friendly learning app get to know a new learner. They just picked what they are into.
Write the next onboarding chips so they fit THESE interests, in a casual, friendly voice.
Reply with JSON only:
{"regular": string, "goals": string[], "curious": string[]}
- "regular": how someone who already follows the FIRST interest would describe themselves, max 30 characters. Example for cricket: "I watch every match".
- "goals": 2 or 3 reasons someone learns about these interests, max 40 characters each. Example: "Follow matches like a pro".
- "curious": 4 or 5 short questions a curious newcomer to these interests wonders about, max 60 characters each, mixing the interests. Example: "Why does dew matter in night matches?"
No emoji. Sentence case.`;

const known = new Set<string>(INTEREST_OPTIONS);

export async function tailor(interests: string[], llm: LlmService): Promise<TailorResponse> {
  const questions = tailorQuestions(interests);
  // The built-in banks already fit the ten suggested interests. A model only helps with ones the reader typed.
  if (interests.every((i) => known.has(i))) return { questions, provider: 'demo' };

  const { data, provider } = await llm.completeJson(
    {
      system: TAILOR_PROMPT,
      messages: [{ role: 'user', content: `Interests, most important first: ${interests.join(', ')}` }],
      temperature: 0.7,
      maxOutputTokens: 900,
      timeoutMs: 5000,
      attempts: 1,
    },
    tailorSchema.nullable(),
    () => null,
  );
  if (!data) return { questions, provider: 'demo' };

  const [level, goals] = questions;
  level!.options[2] = data.regular;
  goals!.options = [...new Set([goals!.options[0]!, ...data.goals, ...goals!.options.slice(1)])].slice(0, 6);
  return { questions, provider };
}

export async function completeOnboarding(user: UserDoc, reader: ReaderCard): Promise<UserDoc> {
  const profile = sanitizeProfile(profileFromReader(reader));
  const answered = Object.values(reader).some((v) => v.length);
  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        profile,
        'onboarding.status': answered ? 'completed' : 'skipped',
        'onboarding.step': TOTAL_STEPS,
        'onboarding.answers': [],
        'onboarding.currentQuestion': '',
      },
    },
    { new: true },
  );
  if (!updated) throw notFound('User not found');
  return updated;
}
