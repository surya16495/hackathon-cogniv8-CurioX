// Push notifications: when something new appears on a topic the reader follows, a short story
// deck is added to today's issue and the phone gets a notification that opens it. Tokens come
// from the app (POST /api/push/token); sending goes through Expo's push API, so no vendor SDKs.
import { topicName } from '@curiox/shared';
import type { PushCheckResponse, PushStatus } from '@curiox/shared';
import { IssueModel, User, type UserDoc } from '../../db/models';
import { addTopicStory, newsFor, type IssueServices } from '../issues';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** At most this many notifications per check, so a busy news day does not become spam. */
const MAX_PER_CHECK = 2;
const MAX_TOPICS = 4;
const KEEP_PUSHED = 150;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Send through Expo. Returns the tokens Expo reports as no longer registered. */
export async function sendExpoPush(messages: PushMessage[], fetchFn: typeof fetch = fetch): Promise<{ invalid: string[] }> {
  if (!messages.length) return { invalid: [] };
  const res = await fetchFn(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default', channelId: 'issues', priority: 'high' }))),
  });
  if (!res.ok) throw new Error(`Expo push ${res.status}`);
  const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  const invalid: string[] = [];
  (body.data ?? []).forEach((r, i) => {
    if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') invalid.push(messages[i]!.to);
  });
  return { invalid };
}

/** Topics watched for a reader: what they follow, or failing that what they have shown interest in. */
export function watchedTopics(user: UserDoc): string[] {
  const interests = (user.profile?.interests ?? []).slice(0, MAX_TOPICS);
  if (interests.length) return interests;
  return [...(user.interestSignals ?? [])]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 2)
    .map((s) => s.topic);
}

export function pushStatus(user: UserDoc): PushStatus {
  return { tokens: user.pushTokens?.length ?? 0, topics: watchedTopics(user), lastCheckedAt: user.pushCheckedAt ? user.pushCheckedAt.toISOString() : null };
}

/**
 * Look for fresh news on the reader's topics. Anything not sent before becomes a story in today's
 * issue (when today's issue exists) and a notification on every registered phone.
 */
export async function checkUserUpdates(user: UserDoc, services: IssueServices, fetchFn: typeof fetch = fetch): Promise<PushCheckResponse> {
  const tokens = (user.pushTokens ?? []).map((t) => t.token);
  const topics = watchedTopics(user);
  const sent: PushCheckResponse['sent'] = [];
  if (!tokens.length || !topics.length) return { ...pushStatus(user), sent };

  const seen = new Set((user.pushed ?? []).map((p) => p.url));
  // Today's issue, if the reader has opened the app today, takes the new story.
  const latest = await IssueModel.findOne({ userId: user._id }).sort({ date: -1 });
  const today = new Date().toISOString().slice(0, 10);
  const issueDate = latest && latest.date >= yesterday(today) ? latest.date : null;

  const messages: PushMessage[] = [];
  const pushedNow: { url: string; at: Date }[] = [];
  for (const topic of topics) {
    if (sent.length >= MAX_PER_CHECK) break;
    const sources = await newsFor(topic, services, 3);
    const fresh = sources.find((s) => !seen.has(s.url));
    if (!fresh) continue;
    let deckId: string | null = null;
    if (issueDate) deckId = await addTopicStory(user, topic, issueDate, services, 'new today').catch(() => null);
    const title = `New in ${topicName(topic)}`;
    for (const to of tokens) messages.push({ to, title, body: fresh.title, data: { deckId, topic } });
    // Every source seen in this check counts as sent, so the next check only reports newer ones.
    for (const s of sources) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      pushedNow.push({ url: s.url, at: new Date() });
    }
    sent.push({ topic, title: fresh.title, deckId });
  }

  let invalid: string[] = [];
  if (messages.length) {
    try {
      ({ invalid } = await sendExpoPush(messages, fetchFn));
    } catch (err) {
      console.warn(`[push] send failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  const pushed = [...(user.pushed ?? []), ...pushedNow].slice(-KEEP_PUSHED);
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { pushed, pushCheckedAt: new Date() }, ...(invalid.length ? { $pull: { pushTokens: { token: { $in: invalid } } } } : {}) },
    { new: true },
  );
  return { ...pushStatus(updated ?? user), sent };
}

function yesterday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Every `intervalMin` minutes, check readers who have a phone registered and were not checked lately. */
export function startPushScheduler(services: IssueServices, intervalMin: number): () => void {
  if (!intervalMin) return () => undefined;
  const ms = intervalMin * 60_000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const since = new Date(Date.now() - ms + 60_000);
      const users = await User.find({ 'pushTokens.0': { $exists: true }, $or: [{ pushCheckedAt: { $exists: false } }, { pushCheckedAt: { $lt: since } }] }).limit(25);
      for (const u of users) {
        const r = await checkUserUpdates(u, services).catch((err) => {
          console.warn(`[push] check failed for ${u._id}: ${err instanceof Error ? err.message : err}`);
          return null;
        });
        if (r?.sent.length) console.info(`[push] ${u._id}: ${r.sent.map((s) => s.topic).join(', ')}`);
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), ms);
  timer.unref();
  // A first pass shortly after boot, so a freshly deployed server catches up.
  const first = setTimeout(() => void tick(), 90_000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
