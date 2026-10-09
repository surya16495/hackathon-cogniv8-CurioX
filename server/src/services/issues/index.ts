// Daily issues: a lead deck and a short deck per interest, made once per reader per day and kept.
// Search finds today's stories; the model writes the cards; every card is validated on its own so one
// bad card never sinks a deck. If nothing works, the reader still gets a labelled demo issue.
import { z } from 'zod';
import {
  cardSchema,
  deckQuizSchema,
  teachSchema,
  toArtKey,
  videoSchema,
  type Card,
  type Deck,
  type DeckKind,
  type DeckQuizQuestion,
  type Issue,
  type Profile,
  type Provider,
  type Source,
  type SourceRef,
  type TeachPrompt,
  type TodayResponse,
  type Video,
} from '@curiox/shared';
import { DeckModel, IssueModel, User, toDeck, toDeckSummary, type DeckDoc, type UserDoc } from '../../db/models';
import { CHAT_DECK_PROMPT, LEAD_DECK_PROMPT, STORY_DECKS_PROMPT } from '../../prompts/issues';
import { profileSummary } from '../../prompts/persona';
import { describeError } from '../../utils/errors';
import { truncate } from '../../utils/async';
import type { LlmService } from '../llm';
import type { SearchService } from '../search';
import { userProfile } from '../onboarding/steps';
import { DEMO_TAG, demoLead, demoStories, type DeckDraft } from './demo';

export interface IssueServices {
  llm: LlmService;
  search: SearchService;
}

const MAX_TOPICS = 4;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The reader's local date if it is plausible (within a day of the server's), else the server's UTC date. */
export function issueDate(requested: unknown, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  if (typeof requested !== 'string' || !DATE.test(requested)) return today;
  const diff = Math.abs(Date.parse(`${requested}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`));
  return diff <= 36 * 3600_000 ? requested : today;
}

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host === 'youtube.com') {
      id = u.searchParams.get('v');
      if (!id) {
        const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

const sourceRef = (s: Source | undefined): SourceRef | null =>
  s ? { title: truncate(s.title, 200), url: s.url, site: truncate(siteOf(s.url) || 'source', 100), summary: truncate(s.snippet, 300) } : null;

function pickSource(sources: Source[], index: unknown): Source | undefined {
  const n = typeof index === 'number' ? index : Number(index);
  return Number.isInteger(n) ? sources.find((s) => s.id === n) : undefined;
}

function validCards(raw: unknown[]): Card[] {
  const out: Card[] = [];
  for (const c of raw) {
    const parsed = cardSchema.safeParse(c);
    if (!parsed.success) continue;
    const card = parsed.data;
    if (card.kind === 'guess' && !(card.min < card.answer && card.answer < card.max)) continue;
    out.push(card);
  }
  return out;
}

function validQuiz(raw: unknown, max: number): DeckQuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => deckQuizSchema.safeParse(q))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .filter((q) => new Set(q.opts.map((o) => o.toLowerCase())).size === 4)
    .slice(0, max);
}

const fallbackTeach = (title: string): TeachPrompt => ({
  q: `What is the big idea in "${truncate(title, 60)}"? One sentence.`,
  sample: 'Say the main idea in your own words, as if telling a friend.',
  add: 'one example makes any explanation stick',
});

function validTeach(raw: unknown, title: string): TeachPrompt {
  const t = teachSchema.safeParse(raw);
  return t.success ? t.data : fallbackTeach(title);
}

// ---------- the lead deck ----------

const looseLead = z
  .object({ title: z.string().min(1), hook: z.object({ lead: z.string().min(1) }).passthrough() })
  .passthrough();
type LooseLead = z.infer<typeof looseLead> & Record<string, any>;

/** Turn the model's lead JSON into validated cards, in the design's order. */
export function assembleLead(raw: LooseLead, sources: Source[], video: Video | null): DeckDraft | null {
  const r = raw as Record<string, any>;
  const src = sourceRef(pickSource(sources, r.what?.sourceIndex) ?? (r.what?.sourceIndex == null ? undefined : sources[0]));
  const cards = validCards([
    { kind: 'hook', title: 'Did you know?', lead: r.hook?.lead, art: r.hook?.art ?? r.art, stickers: ['wow', 'mindblown', 'wow'] },
    { kind: 'what', title: r.what?.title || (sources.length ? 'What happened' : 'The short version'), strips: r.what?.strips, art: r.what?.art, sticker: 'rocket', source: src },
    { kind: 'why', title: 'Why it matters to you', body: r.why?.body, note: r.why?.note ?? '', art: r.why?.art ?? 'eyes' },
    { kind: 'myth', claim: r.myth?.claim ? `“${String(r.myth.claim).replace(/^["“”']+|["“”']+$/g, '')}”` : undefined, answer: r.myth?.answer, explain: r.myth?.explain, sticker: 'monocle' },
    {
      kind: 'ways',
      question: r.ways?.question,
      ways: Array.isArray(r.ways?.ways)
        ? r.ways.ways.slice(0, 3).map((w: any, i: number) => ({ label: w?.label, text: w?.text, art: w?.art ?? ['child', 'sparkles', 'microscope'][i] }))
        : undefined,
      note: r.ways?.note ?? '',
      sticker: 'bulb',
    },
    { kind: 'vs', title: r.vs?.title, left: r.vs?.left, right: r.vs?.right, rows: r.vs?.rows, art: 'scales', sticker: 'zap' },
    { kind: 'guess', ...(r.guess ?? {}), art: 'target', sticker: 'thinking' },
    ...(video ? [{ kind: 'watch', thumbTitle: r.thumbTitle || truncate(r.title, 26), video, art: 'popcorn' }] : []),
  ]);
  // A lead needs its hook and enough to be worth swiping.
  if (cards[0]?.kind !== 'hook' || cards.length < 4) return null;
  return {
    title: truncate(r.title.trim(), 80),
    topic: '',
    art: toArtKey(r.art ?? r.hook?.art),
    cards,
    teach: validTeach(r.teach, r.title),
    quiz: validQuiz(r.quiz, 3),
  };
}

// ---------- story decks ----------

// Models sometimes drop the wrapper object and send the list itself; take either.
const storyList = z.array(z.record(z.any())).min(1);
const looseStories = z.union([z.object({ stories: storyList }), storyList.transform((stories) => ({ stories }))]);

interface StoryItem {
  item: number;
  topic: string;
  sources: Source[];
}

export function assembleStories(raw: { stories: Record<string, any>[] }, items: StoryItem[]): (DeckDraft & { sources: Source[] })[] {
  const out: (DeckDraft & { sources: Source[] })[] = [];
  for (const s of raw.stories) {
    const item = items.find((i) => i.item === Number(s.item));
    if (!item || out.some((o) => o.topic === item.topic) || typeof s.title !== 'string' || !s.title.trim()) continue;
    const ref = sourceRef(pickSource(item.sources, s.sourceIndex) ?? item.sources[0]);
    const cards = validCards(
      (Array.isArray(s.cards) ? s.cards : []).slice(0, 3).map((c: any, i: number) => ({
        kind: 'simple', h: c?.h, body: c?.body, art: c?.art, note: c?.note ?? '', source: i === 0 ? ref : null,
      })),
    );
    if (cards.length < 2) continue;
    out.push({
      title: truncate(s.title.trim(), 80),
      topic: item.topic,
      art: toArtKey(s.art ?? (cards[0] as { art?: string }).art),
      cards,
      teach: validTeach(s.teach, s.title),
      quiz: validQuiz(s.quiz, 2),
      sources: item.sources,
    });
  }
  return out;
}

// ---------- generation ----------

/** News decks get the profile without the curiosities, which otherwise pull every story off topic. */
function learnerBlock(profile: Profile, withCuriosities = false): string {
  return `LEARNER PROFILE:\n${profileSummary(withCuriosities ? profile : { ...profile, curiosities: [] })}`;
}

function sourcesBlock(sources: Source[]): string {
  return sources.length
    ? `SOURCES:\n${sources.map((s) => `[${s.id}] ${s.title} (${siteOf(s.url)})\n${truncate(s.snippet, 500)}`).join('\n\n')}`
    : 'SOURCES: none. Write an evergreen explainer from general knowledge, with no claims about recent events.';
}

// Streams, match coverage and compilations make poor "watch it" cards.
const NOT_EXPLAINERS = /\b(live|livestream|stream|full match|highlights|scorecard|shorts?|#shorts|reaction)\b/i;

async function findVideo(query: string, search: SearchService): Promise<Video | null> {
  const { sources } = await search.search(`${query} explained`, { includeDomains: ['youtube.com'], max: 6 });
  for (const s of sources) {
    if (NOT_EXPLAINERS.test(s.title)) continue;
    const id = youtubeId(s.url);
    if (!id) continue;
    const v = videoSchema.safeParse({
      title: truncate(s.title.replace(/\s*[-|]\s*YouTube\s*$/i, '').trim() || 'Watch it', 160),
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      channel: '',
    });
    if (v.success) return v.data;
  }
  return null;
}

interface Drafts {
  lead: DeckDraft & { sources: Source[] };
  stories: (DeckDraft & { sources: Source[] })[];
  quiet: string[];
  provider: Provider;
}

export async function draftIssue(profile: Profile, services: IssueServices): Promise<Drafts> {
  const interests = profile.interests.slice(0, MAX_TOPICS);
  const demo = (): Drafts => {
    const { stories, quiet } = demoStories(interests);
    return { lead: { ...demoLead(interests), sources: [] }, stories: stories.map((s) => ({ ...s, sources: [] })), quiet, provider: 'demo' };
  };
  if (services.llm.demoMode) return demo();

  // 1. Today's news for each interest.
  const news = await Promise.all(
    interests.map(async (topic) => {
      try {
        const { sources, origin } = await services.search.search(`latest ${topic} news`, { topic: 'news', days: 3, max: 4 });
        return { topic, sources: origin === 'demo' ? [] : sources };
      } catch (err) {
        console.warn(`[issues] news search failed for ${topic} (${describeError(err)})`);
        return { topic, sources: [] as Source[] };
      }
    }),
  );

  // 2. The lead: the first interest with news, or an explainer on something they wondered about.
  const leadNews = news.find((n) => n.sources.length);
  const leadSources = leadNews?.sources.slice(0, 3) ?? [];
  const leadSubject = leadNews ? leadNews.topic : profile.curiosities[0] ?? interests[0] ?? 'how AI models work';
  const videoQuery = leadNews ? leadSources[0]!.title : leadSubject;

  // 3. One short story per interest, from its next-best article.
  const items: StoryItem[] = [];
  const quiet: string[] = [];
  news.forEach((n, i) => {
    const pool = n === leadNews ? n.sources.slice(1, 3) : n.sources.slice(0, 2);
    if (pool.length) items.push({ item: i + 1, topic: n.topic, sources: pool.map((s, k) => ({ ...s, id: k + 1 })) });
    else if (n !== leadNews) quiet.push(n.topic);
  });

  const leadTask = services.llm.completeJson(
    {
      system: LEAD_DECK_PROMPT,
      messages: [{
        role: 'user',
        content: [
          learnerBlock(profile, !leadNews),
          leadNews ? `TODAY'S STORY, from the reader's interest "${leadNews.topic}":` : `NO NEWS TODAY. Explain: ${leadSubject}`,
          sourcesBlock(leadSources),
        ].join('\n\n'),
      }],
      tier: 'main',
      temperature: 0.7,
      maxOutputTokens: 6000,
      timeoutMs: 45_000,
    },
    looseLead.nullable(),
    () => null,
  );
  const storiesTask = items.length
    ? services.llm.completeJson(
        {
          system: STORY_DECKS_PROMPT,
          messages: [{
            role: 'user',
            content: [
              learnerBlock(profile),
              ...items.map((it) => `ITEM ${it.item}: the reader's interest "${it.topic}"\n${sourcesBlock(it.sources)}`),
            ].join('\n\n'),
          }],
          tier: 'main',
          temperature: 0.7,
          maxOutputTokens: 6000,
          timeoutMs: 45_000,
        },
        looseStories.nullable(),
        () => null,
      )
    : Promise.resolve({ data: null, provider: 'demo' as Provider });

  const [leadRes, storiesRes] = await Promise.all([leadTask, storiesTask]);
  // The video is looked up from the deck's own headline, which says what the story is about
  // far better than a news site's headline does.
  const video = await findVideo(leadRes.data?.title ?? videoQuery, services.search).catch(() => null);

  const lead = leadRes.data ? assembleLead(leadRes.data, leadSources, video) : null;
  if (!lead) {
    console.warn(`[issues] lead deck unusable (${leadRes.data ? 'too few valid cards' : 'no valid JSON'} from ${leadRes.provider}); using the demo issue`);
    if (leadRes.data && process.env.NODE_ENV !== 'test') console.warn(`[issues] lead JSON: ${truncate(JSON.stringify(leadRes.data), 1500)}`);
    return demo();
  }

  const stories = storiesRes.data ? assembleStories(storiesRes.data, items) : [];
  for (const it of items) if (!stories.some((s) => s.topic === it.topic)) quiet.push(it.topic);
  return {
    lead: { ...lead, topic: leadNews?.topic ?? interests[0] ?? '', sources: leadSources },
    stories,
    quiet: interests.filter((i) => quiet.includes(i)),
    provider: leadRes.provider,
  };
}

/** Hand out the next issue number, atomically. */
async function nextNumber(userId: unknown): Promise<number> {
  const u = await User.findByIdAndUpdate(userId, { $inc: { issueCount: 1 } }, { new: true });
  return u?.issueCount ?? 1;
}

function saveDeck(userId: unknown, no: number, kind: DeckKind, tag: string, d: DeckDraft & { sources?: Source[] }, provider: Provider, date: string | null) {
  return DeckModel.create({
    userId, no, kind, tag, date, provider,
    title: d.title, topic: d.topic, art: d.art, cards: d.cards, teach: d.teach, quiz: d.quiz, sources: d.sources ?? [],
  });
}

async function loadIssue(userId: unknown, date: string): Promise<Issue | null> {
  const issue = await IssueModel.findOne({ userId, date });
  if (!issue) return null;
  const decks = await DeckModel.find({ _id: { $in: [issue.leadId, ...issue.storyIds] } });
  const byId = new Map(decks.map((d) => [d._id.toString(), d]));
  const lead = byId.get(issue.leadId.toString());
  if (!lead) return null;
  return {
    no: issue.no,
    date,
    lead: toDeck(lead),
    stories: issue.storyIds.map((id) => byId.get(id.toString())).filter((d): d is DeckDoc => !!d).map(toDeck),
    quiet: issue.quiet ?? [],
  };
}

async function backIssues(userId: unknown, exclude: string[]) {
  const decks = await DeckModel.find({ userId, kind: { $in: ['lead', 'chat', 'talk', 'demo'] }, _id: { $nin: exclude } })
    .sort({ createdAt: -1 })
    .limit(12);
  return decks.map(toDeckSummary);
}

async function buildIssue(user: UserDoc, date: string, services: IssueServices): Promise<Issue> {
  const drafts = await draftIssue(userProfile(user), services);
  // Someone else may have finished first while the model was writing.
  const existing = await loadIssue(user._id, date);
  if (existing) return existing;

  const no = await nextNumber(user._id);
  const demo = drafts.provider === 'demo';
  const lead = await saveDeck(user._id, no, demo ? 'demo' : 'lead', demo ? DEMO_TAG : 'today', drafts.lead, drafts.provider, date);
  const stories = await Promise.all(drafts.stories.map((s) => saveDeck(user._id, no, 'story', demo ? DEMO_TAG : 'today', s, drafts.provider, date)));
  try {
    await IssueModel.create({ userId: user._id, date, no, leadId: lead._id, storyIds: stories.map((s) => s._id), quiet: drafts.quiet });
  } catch (err) {
    // A duplicate key means a parallel request saved the issue first: drop ours, use theirs.
    if ((err as { code?: number }).code !== 11000) throw err;
    await DeckModel.deleteMany({ _id: { $in: [lead._id, ...stories.map((s) => s._id)] } });
    const winner = await loadIssue(user._id, date);
    if (winner) return winner;
    throw err;
  }
  return { no, date, lead: toDeck(lead), stories: stories.map(toDeck), quiet: drafts.quiet };
}

const inflight = new Map<string, Promise<Issue>>();

export async function todayIssue(user: UserDoc, date: string, services: IssueServices): Promise<TodayResponse> {
  let issue = await loadIssue(user._id, date);
  if (!issue) {
    const key = `${user._id.toString()}:${date}`;
    let job = inflight.get(key);
    if (!job) {
      job = buildIssue(user, date, services).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    issue = await job;
  }
  const back = await backIssues(user._id, [issue.lead.id, ...issue.stories.map((s) => s.id)]);
  return { issue, backIssues: back };
}

/** Start over: drop today's issue so the next request makes a fresh one (after the reader card changes). */
export async function discardIssue(user: UserDoc, date: string): Promise<void> {
  const issue = await IssueModel.findOneAndDelete({ userId: user._id, date });
  if (issue) await DeckModel.deleteMany({ _id: { $in: [issue.leadId, ...issue.storyIds] } });
}

// ---------- decks made from a chat or a talk ----------

const looseChatDeck = z.object({ title: z.string().min(1), cards: z.array(z.record(z.any())).min(2) }).passthrough();

export async function deckFromConversation(user: UserDoc, title: string, transcript: string, sources: Source[], llm: LlmService): Promise<Deck> {
  const profile = userProfile(user);
  const { data, provider } = await llm.completeJson(
    {
      system: CHAT_DECK_PROMPT,
      messages: [{ role: 'user', content: `${learnerBlock(profile, true)}\n\nCONVERSATION:\n${truncate(transcript, 6000)}` }],
      tier: 'lite',
      temperature: 0.5,
      maxOutputTokens: 3000,
      timeoutMs: 25_000,
    },
    looseChatDeck.nullable(),
    () => null,
  );
  let draft: DeckDraft & { sources: Source[] };
  const cards = data ? validCards(data.cards.slice(0, 4).map((c: any, i: number) => ({ kind: 'simple', h: c?.h, body: c?.body, art: c?.art, note: '', source: i === 0 ? sourceRef(sources[0]) : null }))) : [];
  if (data && cards.length >= 2) {
    draft = { title: truncate(data.title, 80), topic: '', art: toArtKey(data.art), cards, teach: validTeach(data.teach, data.title), quiz: validQuiz(data.quiz, 3), sources };
  } else {
    // No model: cut the last answer into cards, paragraph by paragraph.
    const paras = transcript.split(/\n{2,}/).map((p) => p.replace(/^(CurioX|Learner):\s*/, '').replace(/[*_#>`]/g, '').trim()).filter((p) => p.length > 30);
    draft = {
      title: truncate(title, 80), topic: '', art: 'speech', sources, quiz: [], teach: fallbackTeach(title),
      cards: (paras.length ? paras : [transcript]).slice(-3).map((p, i) => ({ kind: 'simple', h: i ? `Part ${i + 1}` : truncate(title, 48), body: truncate(p, 360), art: 'speech', note: '', source: null })),
    };
  }
  const no = await nextNumber(user._id);
  return toDeck(await saveDeck(user._id, no, 'chat', 'from your chat', draft, data ? provider : 'demo', null));
}

export async function deckFromTalk(user: UserDoc, title: string | undefined, points: { h: string; say: string }[]): Promise<Deck> {
  const cards = validCards(points.map((p) => ({ kind: 'simple', h: p.h, body: p.say, art: 'speech', note: '', source: null })));
  const name = title?.trim() || truncate(points[0]?.h ?? 'Your talk', 60);
  const no = await nextNumber(user._id);
  const draft: DeckDraft = { title: name, topic: '', art: 'speech', cards, quiz: [], teach: fallbackTeach(name) };
  return toDeck(await saveDeck(user._id, no, 'talk', 'from your talk', draft, 'demo', null));
}

export async function getDeck(user: UserDoc, id: string): Promise<Deck | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const d = await DeckModel.findOne({ _id: id, userId: user._id });
  return d ? toDeck(d) : null;
}
