// Talk mode: a guided, spoken conversation in the reader's chosen tone.
//   open   → a greeting with today's updates, then "what do you want to learn about?"
//   turn   → explain → ask their view → explain the impact → ask what they make of it → free chat
//   finish → keep the key points, score how keen they were, and update the reader's interests
import { z } from 'zod';
import {
  talkPointSchema,
  type Issue,
  type Profile,
  type TalkFinishResponse,
  type TalkOpenResponse,
  type TalkPoint,
  type TalkResponse,
  type TalkStage,
  type TeachResponse,
  type VoiceTone,
  voiceToneOf,
} from '@curiox/shared';
import { CURIOX_PERSONA, SPOKEN_STYLE, profileSummary } from '../../prompts/persona';
import { truncate } from '../../utils/async';
import type { LlmMessage, LlmService } from '../llm';

// ---------- tone ----------

const voiceTone = (profile: Pick<Profile, 'tone'>): VoiceTone => voiceToneOf(profile.tone);

const TONE_GUIDE: Record<VoiceTone, string> = {
  friendly: 'Tone: FRIENDLY. Warm and encouraging, like a kind friend who is glad you asked. Gentle humour, lots of "you", small compliments when earned.',
  casual: 'Tone: CASUAL. Relaxed and unfussy, like chatting on the sofa. Short sentences, everyday words ("yeah", "pretty much", "so basically"), no formality, no gushing.',
  playful: 'Tone: PLAYFUL. Upbeat and a bit cheeky. Light jokes, fun comparisons, the odd exclamation, a tease now and then, never at the reader\'s expense.',
};

const POINTS_FORMAT = `Reply with JSON only: {"points": [{"h": string, "say": string}], "topic": string, "done": boolean}
- "points": 2 to 4 points that together are your reply, in speaking order. "say" is what you say out loud for that point: one or two short spoken sentences, max 220 characters. "h" is a 2 to 5 word sticky-note heading for it.
- "topic": the topic of this conversation as 2 to 5 plain words (e.g. "rocket reuse"), or "" if there is none yet.
- "done": true only if the reader clearly said goodbye or that they are done.
Sound like a person: open naturally ("Okay, so…", "Oh nice,", "Right,"), explain any jargon in the same breath, use one everyday analogy, and never read out lists or headings.`;

function system(profile: Profile, extra: string[]): string {
  return [CURIOX_PERSONA, SPOKEN_STYLE, TONE_GUIDE[voiceTone(profile)], `LEARNER PROFILE:\n${profileSummary(profile)}`, ...extra].join('\n\n');
}

const greetingWord = (hour: number) => (hour < 5 ? 'Hey, night owl' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');

const issueLines = (issue: Issue | null) =>
  issue
    ? [`Lead story: ${issue.lead.title}. ${issue.lead.cards[0]?.kind === 'hook' ? issue.lead.cards[0].lead : ''}`, ...issue.stories.slice(0, 4).map((s) => `Also: ${s.title}. ${s.cards[0]?.kind === 'simple' ? truncate(s.cards[0].body, 140) : ''}`)].join('\n')
    : 'No issue yet today.';

const talkSchema = z.object({
  points: z.array(talkPointSchema).min(1).max(5),
  topic: z.string().trim().max(80).default(''),
  done: z.boolean().default(false),
});

// ---------- open ----------

/** What's new today, said from the issue itself: models tend to invent extra stories here. */
export function todayLine(issue: Issue | null): string | null {
  if (!issue) return null;
  const hook = issue.lead.cards[0]?.kind === 'hook' ? issue.lead.cards[0].lead : '';
  const titles = issue.stories.map((s) => s.title);
  const also = titles.length ? ` Also on your home: ${titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`}.` : '';
  return truncate(`Today's big one: ${issue.lead.title}. ${hook}${also}`, 300);
}

export async function openTalk(profile: Profile, issue: Issue | null, hour: number, llm: LlmService): Promise<TalkOpenResponse> {
  const hello = greetingWord(hour);
  const today = todayLine(issue);
  const { data, provider } = await llm.completeJson(
    {
      system: system(profile, [
        `TODAY'S ISSUE FOR THIS READER:\n${issueLines(issue)}`,
        `You are opening a spoken conversation. Point 1: say hello ("${hello}!") in one short sentence. Point 2: say what is new today, using ONLY the issue above: say what the lead story is about in plain words (keep its real subject, e.g. names, teams, places) and then name the other stories in a few words each. Never describe stories that are not listed, and never be vague ("a tech trend", "a science story"). Point 3: ask what they would like to learn about: one of today's stories, or anything else. Exactly 3 points. Set "topic" to "" and "done" to false.`,
        POINTS_FORMAT,
      ]),
      messages: [{ role: 'user', content: 'Start the conversation.' }],
      tier: 'main',
      temperature: 0.8,
      maxOutputTokens: 600,
      timeoutMs: 15_000,
    },
    talkSchema.nullable(),
    () => null,
  );
  let points: TalkPoint[] = data?.points.slice(0, 3) ?? [
    { h: `${hello}!`, say: `${hello}! Lovely to have you here.` },
    { h: 'Today', say: '' },
    { h: 'Your pick', say: 'So, what do you want to learn about today? Something from today, or anything at all.' },
  ];
  // The model says hello and asks the question; the update itself comes straight from the issue.
  if (today) points = points.length >= 3 ? [points[0]!, { h: 'Today', say: today }, ...points.slice(2)] : [points[0] ?? { h: `${hello}!`, say: `${hello}!` }, { h: 'Today', say: today }, ...points.slice(1)];
  else points = points.filter((p) => p.say);
  return { points, reply: points.map((p) => p.say).join(' '), stage: 'topic', provider: data ? provider : 'demo' };
}

// ---------- turn ----------

const STAGE_TASK: Record<TalkStage, { task: string; next: TalkStage; ask: string }> = {
  topic: {
    task: 'The reader just said what they want to learn about (it may be one of today\'s stories, perhaps named loosely). Explain it simply in 2 or 3 points, the core idea first, then END by asking for their view on it (for example "What\'s your take?" or "Does that surprise you?"). Set "topic" to the subject in 2 to 5 words.',
    next: 'view',
    ask: "So, what's your take on that?",
  },
  view: {
    task: 'The reader just gave their view. React to it genuinely in your first point (agree, add nuance, or gently push back), then explain the IMPACT: why it matters, what changes because of it, who it affects. END by asking what they make of that impact.',
    next: 'reflect',
    ask: 'What do you make of that?',
  },
  reflect: {
    task: 'The reader just reacted to the impact. Respond to what they said, add one surprising angle or a concrete example, then END by asking whether they want to go deeper, try another topic, or wrap up.',
    next: 'free',
    ask: 'Want to go deeper, try another topic, or wrap up?',
  },
  free: {
    task: 'Keep the conversation going naturally. If they pick a new topic, explain it and ask their view. If they want to go deeper, do. If they say goodbye or that they are done, say a short warm goodbye and set "done" to true.',
    next: 'free',
    ask: '',
  },
};

/** Each guided stage ends on a question; if the model forgot, the question is asked anyway. */
export function withClosingQuestion(points: TalkPoint[], stage: TalkStage, done: boolean): TalkPoint[] {
  const ask = STAGE_TASK[stage].ask;
  if (done || !ask || points.some((p) => p.say.includes('?'))) return points;
  const last = points[points.length - 1];
  if (last && last.say.length + ask.length + 1 <= 300) return [...points.slice(0, -1), { ...last, say: `${last.say} ${ask}` }];
  return [...points, { h: 'Your turn', say: ask }];
}

export async function talk(input: { message: string; history: LlmMessage[]; stage: TalkStage; topic?: string; issue: Issue | null }, profile: Profile, llm: LlmService): Promise<TalkResponse> {
  const stageDef = STAGE_TASK[input.stage];
  const { data, provider } = await llm.completeJson(
    {
      system: system(profile, [
        `TODAY'S ISSUE FOR THIS READER (for reference when they name a story):\n${issueLines(input.issue)}`,
        input.topic ? `CURRENT TOPIC: ${input.topic}` : '',
        `THIS TURN: ${stageDef.task}`,
        POINTS_FORMAT,
      ].filter(Boolean)),
      messages: [...input.history.slice(-6), { role: 'user', content: input.message }],
      tier: 'main',
      temperature: 0.8,
      maxOutputTokens: 700,
      timeoutMs: 20_000,
    },
    talkSchema.nullable(),
    () => null,
  );
  const farewell = /\b(bye|goodbye|see you|that'?s all|i'?m done|catch you later|wrap (it )?up)\b/i.test(input.message);
  if (!data) {
    const points = farewell
      ? [{ h: 'Bye for now', say: 'Okay, let\'s wrap up there. Thanks for the chat!' }]
      : [
          { h: 'Lost the line', say: `Sorry, I couldn't reach my brain just then, so I can't do "${truncate(input.message, 60)}" justice.` },
          { h: 'Try again', say: 'Give it a moment and say that again?' },
        ];
    return { points, reply: points.map((p) => p.say).join(' '), stage: input.stage, topic: input.topic ?? null, done: farewell, provider: 'demo' };
  }
  const points = withClosingQuestion(data.points.slice(0, 4), input.stage, data.done);
  return {
    points,
    reply: points.map((p) => p.say).join(' '),
    stage: data.done ? 'free' : stageDef.next,
    topic: data.topic || input.topic || null,
    done: data.done || farewell,
    provider,
  };
}

// ---------- finish ----------

const finishSchema = z.object({
  topic: z.string().trim().min(1).max(80),
  keyPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  interest: z.number().min(0).max(100),
  reason: z.string().trim().max(200).default(''),
  goodbye: z.string().trim().min(1).max(220),
});

const FINISH_PROMPT = `A spoken learning conversation just ended. Read the transcript and reply with JSON only:
{"topic": string, "keyPoints": string[], "interest": number, "reason": string, "goodbye": string}
- "topic": what it was mostly about, 2 to 5 plain words, title case not needed.
- "keyPoints": 3 to 5 one-sentence takeaways the reader should remember, in plain words.
- "interest": 0 to 100, how keen the READER (not you) seemed on the topic: did they ask questions, share opinions, give detailed answers, want to go deeper (high), or give one-word answers and change the subject (low)?
- "reason": one short sentence for the score.
- "goodbye": one warm spoken sentence to end with, in the tone requested, mentioning one thing they'll remember. Max 200 characters.`;

/** Without a model: longer, more frequent reader turns mean more interest. */
export function roughInterest(history: LlmMessage[]): number {
  const mine = history.filter((m) => m.role === 'user');
  if (!mine.length) return 20;
  const words = mine.reduce((n, m) => n + m.content.split(/\s+/).length, 0) / mine.length;
  const questions = mine.filter((m) => m.content.includes('?')).length;
  return Math.min(100, Math.round(25 + Math.min(mine.length, 6) * 7 + Math.min(words, 30) * 1.2 + questions * 6));
}

export const interestLevel = (score: number): TalkFinishResponse['level'] => (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');

export async function finishTalk(input: { topic?: string; history: LlmMessage[]; points: TalkPoint[] }, profile: Profile, llm: LlmService): Promise<Omit<TalkFinishResponse, 'addedInterest' | 'deckId' | 'profile'>> {
  const transcript = input.history.map((m) => `${m.role === 'user' ? 'Reader' : 'CurioX'}: ${m.content}`).join('\n');
  const { data, provider } = await llm.completeJson(
    {
      system: [FINISH_PROMPT, TONE_GUIDE[voiceTone(profile)]].join('\n\n'),
      messages: [{ role: 'user', content: `${input.topic ? `Topic so far: ${input.topic}\n` : ''}TRANSCRIPT:\n${truncate(transcript, 7000)}` }],
      temperature: 0.3,
      maxOutputTokens: 600,
      timeoutMs: 15_000,
    },
    finishSchema.nullable(),
    () => null,
  );
  if (data) {
    const interest = Math.round(data.interest);
    return { topic: data.topic, keyPoints: data.keyPoints, interest, level: interestLevel(interest), reply: data.goodbye, provider };
  }
  const interest = roughInterest(input.history);
  const topic = input.topic?.trim() || 'what we talked about';
  return {
    topic,
    keyPoints: input.points.slice(0, 5).map((p) => p.say),
    interest,
    level: interestLevel(interest),
    reply: `That was a good one. I'll remember what we said about ${topic}. See you next time!`,
    provider: 'demo',
  };
}

// ---------- teach it back ----------

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
