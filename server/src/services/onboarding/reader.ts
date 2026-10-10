// The chip onboarding: questions 2 to 5 are written for the interests picked in question 1 (and
// the answers given since), and the finished reader card becomes the profile in one save.
import { z } from 'zod';
import { profileFromReader, tailorQuestions, type ReaderCard, type TailorResponse } from '@curiox/shared';
import { User, type UserDoc } from '../../db/models';
import { notFound } from '../../utils/errors';
import type { LlmService } from '../llm';
import { sanitizeProfile } from './extract';
import { TOTAL_STEPS } from './steps';

const chip = z.string().trim().min(1).max(48);
const qSchema = z.object({ q: z.string().trim().min(6).max(90), options: z.array(chip).min(3).max(7) });
const tailorSchema = z.object({ levels: z.array(qSchema.extend({ topic: chip })).min(1).max(4), goals: qSchema, style: qSchema, tone: qSchema });

const TAILOR_PROMPT = `You help a friendly learning app (CurioX) get to know a new learner through four quick chip questions, after they picked what they are into. Write ALL FOUR questions so they clearly follow from THOSE interests (name them in the question where natural) and from any answers already given. Never generic, never about a topic they did not pick.
Reply with JSON only:
{"levels": [{"topic": string, "q": string, "options": [4 strings]}], "goals": {"q": string, "options": [5 strings]}, "style": {"q": string, "options": [5 strings]}, "tone": {"q": string, "options": [5 strings]}}
- levels: ONE entry per interest, in the order given (at most the first three), "topic" exactly as given. Each asks how much they already know about THAT interest alone, options from newcomer to expert in the words of that world. Cricket: "Just curious", "I know the basics", "I watch every match", "I could commentate". Space: "Just curious", "I know the basics", "I follow every launch", "I could teach orbital mechanics".
- goals: why someone with these interests learns, mixing the interests; if a level is known, fit it (an expert is not "learning the basics").
- style: how explanations should be built for these interests and that level ("Match examples", "Step by step", "Numbers and charts", "Analogies", "Short and blunt"…).
- tone: how CurioX should sound, fitting these interests and goals ("Like a commentator", "Calm and clear", "Playful", "Like a coach"…), always including one of: Friendly, Casual, Playful.
Questions max 80 characters, options max 36 characters, sentence case, no emoji, no duplicates, no numbering.`;

/** Questions 2 to 5 for these interests, written by the model; the built-in questions if it cannot. */
export async function tailor(interests: string[], llm: LlmService, answers: { level?: string[]; goals?: string[]; style?: string[] } = {}): Promise<TailorResponse> {
  const fallback = tailorQuestions(interests);
  const given = (['level', 'goals', 'style'] as const).filter((k) => answers[k]?.length).map((k) => `${k}: ${answers[k]!.join(', ')}`);
  const content = [`Interests, most important first: ${interests.join(', ')}`, given.length ? `Answers so far: ${given.join('; ')}` : ''].filter(Boolean).join('\n');
  const { data, provider } = await llm.completeJson(
    { system: TAILOR_PROMPT, messages: [{ role: 'user', content }], temperature: 0.7, maxOutputTokens: 900, timeoutMs: 8000, attempts: 1 },
    tailorSchema.nullable(),
    () => null,
  );
  if (!data) return { questions: fallback, provider: 'demo' };
  const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  let levelIndex = 0;
  const questions = fallback.map((fq) => {
    const written =
      fq.key === 'level'
        ? (data.levels.find((l) => l.topic.toLowerCase() === (fq.topic ?? '').toLowerCase()) ?? data.levels[levelIndex++])
        : data[fq.key as 'goals' | 'style' | 'tone'];
    if (!written) return fq;
    const options = dedupe(written.options);
    return options.length >= 3 ? { ...fq, q: written.q, options } : fq;
  });
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
