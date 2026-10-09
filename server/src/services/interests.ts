// Interest ranking from what the reader does: reading a deck (1), asking about something (2),
// talking about it (3). At PROMOTE_AT the topic joins the reader's interests, so tomorrow's issue
// follows it, and a reader who skipped the questions ends up with interests anyway.
import { profileFromReader, readerFromProfile, type Profile, type SignalKind } from '@curiox/shared';
import { User, type UserDoc } from '../db/models';
import { sanitizeProfile } from './onboarding/extract';
import { userProfile } from './onboarding/steps';

export const WEIGHT: Record<SignalKind, number> = { read: 1, ask: 2, talk: 3 };
export const PROMOTE_AT = 4;
const MAX_SIGNALS = 40;

const tidy = (t: string) => {
  const s = t.trim().replace(/\s+/g, ' ').slice(0, 60);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Known broad subjects in the reader's words: "Space" and "space news" count as the same. */
const same = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/\b(news|updates?|today)\b/g, '').trim();
  const y = b.toLowerCase().replace(/\b(news|updates?|today)\b/g, '').trim();
  return x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y));
};

export async function recordSignal(user: UserDoc, rawTopic: string, kind: SignalKind): Promise<{ promoted: boolean; profile: Profile }> {
  const topic = tidy(rawTopic);
  const profile = userProfile(user);
  if (!topic || topic.length < 2 || profile.interests.some((i) => same(i, topic))) return { promoted: false, profile };

  const signals = (user.interestSignals ?? []).map((s) => ({ topic: s.topic, score: s.score ?? 0, lastAt: s.lastAt ?? new Date() }));
  const hit = signals.find((s) => same(s.topic, topic));
  if (hit) {
    hit.score += WEIGHT[kind];
    hit.lastAt = new Date();
  } else signals.push({ topic, score: WEIGHT[kind], lastAt: new Date() });
  signals.sort((a, b) => b.score - a.score);

  const winner = signals.find((s) => same(s.topic, topic))!;
  let next = profile;
  let promoted = false;
  if (winner.score >= PROMOTE_AT) {
    promoted = true;
    const reader = readerFromProfile(profile);
    reader.interests = [...reader.interests, winner.topic];
    next = sanitizeProfile({ ...profileFromReader(reader), knowledgeLevels: profile.knowledgeLevels.length ? [...profile.knowledgeLevels, { topic: winner.topic, level: 'beginner' as const }] : [] });
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { interestSignals: signals.filter((s) => !promoted || !same(s.topic, topic)).slice(0, MAX_SIGNALS), ...(promoted ? { profile: next } : {}) } },
  );
  return { promoted, profile: next };
}
