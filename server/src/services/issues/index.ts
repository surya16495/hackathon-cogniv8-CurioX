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
import { TalkSession } from '../../db/models';
import { profileSummary } from '../../prompts/persona';
import { describeError } from '../../utils/errors';
import { truncate } from '../../utils/async';
import type { LlmService } from '../llm';
import type { SearchService } from '../search';
import { userProfile } from '../onboarding/steps';
import { DEMO_TAG, demoLead, demoStories, type DeckDraft } from './demo';
import { RELATED_TOPICS_PROMPT } from '../../prompts/issues';

const summaryOf = (raw: unknown, title: string): string =>
  typeof raw === 'string' && raw.trim() ? truncate(raw.trim(), 320) : `That was ${truncate(title, 60)}. Swipe back any time to go over it again.`;

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
    summary: summaryOf(r.summary, r.title),
    teach: validTeach(r.teach, r.title),
    quiz: validQuiz(r.quiz, 3),
  };
}

/** A story card as the model wrote it, given the fixed art the design uses for that card type. */
function storyCard(c: Record<string, any>, ref: SourceRef | null, index: number, fallbackArt: unknown): unknown {
  switch (c?.kind) {
    case 'guess':
      return { kind: 'guess', ...c, art: 'target', sticker: 'thinking' };
    case 'myth':
      return { kind: 'myth', claim: c.claim ? `“${String(c.claim).replace(/^["“”']+|["“”']+$/g, '')}”` : undefined, answer: c.answer, explain: c.explain, sticker: 'monocle' };
    case 'vs':
      return { kind: 'vs', title: c.title, left: { label: c.left?.label, art: 'scooter' }, right: { label: c.right?.label, art: 'truck' }, rows: c.rows, art: 'scales', sticker: 'zap' };
    case 'ways':
      return {
        kind: 'ways',
        question: c.question,
        ways: Array.isArray(c.ways) ? c.ways.slice(0, 3).map((w: any, i: number) => ({ label: w?.label, text: w?.text, art: w?.art ?? ['child', 'sparkles', 'microscope'][i] })) : undefined,
        note: c.note ?? '',
        sticker: 'bulb',
      };
    default:
      return { kind: 'simple', h: c?.h, body: c?.body, art: c?.art ?? fallbackArt, note: c?.note ?? '', source: index === 0 ? ref : null };
  }
}

// ---------- story decks ----------

// Models sometimes drop the wrapper object and send the list itself; take either.
const storyList = z.array(z.record(z.any())).min(1);
const looseStories = z.union([z.object({ stories: storyList }), storyList.transform((stories) => ({ stories }))]);

interface StoryItem {
  item: number;
  /** The interest, or "" in discover mode (the model names the subject). */
  topic: string;
  /** For an adjacent topic: the interest it is related to. */
  relatedTo?: string;
  sources: Source[];
}

export function assembleStories(raw: { stories: Record<string, any>[] }, items: StoryItem[]): (DeckDraft & { sources: Source[] })[] {
  const out: (DeckDraft & { sources: Source[] })[] = [];
  const used = new Set<number>();
  for (const s of raw.stories) {
    const item = items.find((i) => i.item === Number(s.item));
    if (!item || used.has(item.item) || typeof s.title !== 'string' || !s.title.trim()) continue;
    used.add(item.item);
    const ref = sourceRef(pickSource(item.sources, s.sourceIndex) ?? item.sources[0]);
    const raw = (Array.isArray(s.cards) ? s.cards : []).slice(0, 4);
    const cards = validCards(raw.map((c: any, i: number) => storyCard(c, ref, i, s.art)));
    if (cards.length < 2) continue;
    const subject = typeof s.topic === 'string' && s.topic.trim() ? truncate(s.topic.trim(), 40) : '';
    out.push({
      title: truncate(s.title.trim(), 80),
      topic: item.topic || subject || 'Today',
      relatedTo: item.relatedTo ?? '',
      art: toArtKey(s.art ?? (cards[0] as { art?: string }).art),
      cards,
      summary: summaryOf(s.summary, s.title),
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
  /** Carousel order among `stories` (the lead is always first): up to FEATURED - 1 of them. */
  featured: number[];
  quiet: string[];
  discover: boolean;
  provider: Provider;
}

/** How many decks "Today for you" shows, lead included. */
export const FEATURED = 5;
/** At least this many stories under "Also in this issue" when the interests allow. */
const ALSO_MIN = 3;
const MAX_STORIES = 9;

export interface DraftContext {
  /** Topics from the reader's recent talks, newest first, not already interests. */
  talkTopics?: string[];
}

const relatedSchema = z.object({ topics: z.array(z.object({ topic: z.string().trim().min(2).max(60), because: z.string().trim().max(80).default('') })).min(1).max(8) });

async function newsFor(topic: string, services: IssueServices, max = 4): Promise<Source[]> {
  try {
    const { sources, origin } = await services.search.search(`latest ${topic} news`, { topic: 'news', days: 3, max });
    return origin === 'demo' ? [] : sources;
  } catch (err) {
    console.warn(`[issues] news search failed for ${topic} (${describeError(err)})`);
    return [];
  }
}

/** Adjacent topics the reader would probably enjoy, each tied to the interest it comes from. */
async function relatedTopics(profile: Profile, llm: LlmService): Promise<{ topic: string; because: string }[]> {
  if (!profile.interests.length) return [];
  const { data } = await llm.completeJson(
    { system: RELATED_TOPICS_PROMPT, messages: [{ role: 'user', content: `The reader follows: ${profile.interests.join(', ')}` }], temperature: 0.8, maxOutputTokens: 500, timeoutMs: 8000 },
    relatedSchema.nullable(),
    () => null,
  );
  const lower = new Set(profile.interests.map((i) => i.toLowerCase()));
  return (data?.topics ?? []).filter((t) => !lower.has(t.topic.toLowerCase())).slice(0, 6);
}

async function writeStories(profile: Profile, items: StoryItem[], services: IssueServices): Promise<{ stories: (DeckDraft & { sources: Source[] })[]; provider: Provider }> {
  if (!items.length) return { stories: [], provider: 'demo' };
  // Five items per model call keeps each reply inside the free tiers' token budgets.
  const chunks: StoryItem[][] = [];
  for (let i = 0; i < items.length; i += 5) chunks.push(items.slice(i, i + 5));
  const results = await Promise.all(
    chunks.map((chunk) =>
      services.llm.completeJson(
        {
          system: STORY_DECKS_PROMPT,
          messages: [{
            role: 'user',
            content: [
              learnerBlock(profile),
              ...chunk.map((it) => `ITEM ${it.item}: ${it.topic ? `the reader's interest "${it.topic}"` : it.relatedTo ? `an adjacent topic (because they follow "${it.relatedTo}")` : "one of today's top stories"}\n${sourcesBlock(it.sources)}`),
            ].join('\n\n'),
          }],
          tier: 'main',
          temperature: 0.7,
          maxOutputTokens: 4500,
          timeoutMs: 45_000,
        },
        looseStories.nullable(),
        () => null,
      ),
    ),
  );
  const stories = results.flatMap((r) => (r.data ? assembleStories(r.data, items) : []));
  const provider = results.find((r) => r.data)?.provider ?? 'demo';
  return { stories, provider };
}

export async function draftIssue(profile: Profile, services: IssueServices, ctx: DraftContext = {}): Promise<Drafts> {
  const interests = profile.interests.slice(0, MAX_TOPICS);
  const discover = interests.length === 0;
  const demo = (): Drafts => {
    const { stories, quiet } = demoStories(interests.length ? interests : ['Artificial intelligence', 'Cricket', 'Space', 'Personal finance']);
    const list = stories.map((s) => ({ ...s, relatedTo: '', sources: [] as Source[] }));
    return { lead: { ...demoLead(interests), relatedTo: '', sources: [] }, stories: list, featured: list.map((_, i) => i).slice(0, FEATURED - 1), quiet, discover, provider: 'demo' };
  };
  if (services.llm.demoMode) return demo();

  // 1. Candidate stories: the reader's interests, then what they talked about, then adjacent topics.
  //    A new reader with no interests gets today's top stories instead.
  const items: StoryItem[] = [];
  const quiet: string[] = [];
  let leadSources: Source[] = [];
  let leadTopic = '';
  let leadLine = '';
  const addItem = (topic: string, sources: Source[], relatedTo = '') => {
    if (!sources.length || items.length >= MAX_STORIES) return;
    items.push({ item: items.length + 1, topic, relatedTo, sources: sources.map((s, k) => ({ ...s, id: k + 1 })) });
  };

  if (discover) {
    // A spread of today's top stories, two per area, so a new reader sees variety and what they
    // open tells CurioX what they like.
    const areas = ['world', 'technology', 'science', 'sports', 'business'];
    const perArea = await Promise.all(areas.map((a) => services.search.search(`top ${a} news stories today`, { topic: 'news', days: 1, max: 2 }).then((r) => (r.origin === 'demo' ? [] : r.sources)).catch(() => [] as Source[])));
    const seen = new Set<string>();
    const sources: Source[] = [];
    for (let i = 0; i < 2; i++) for (const list of perArea) { const src = list[i]; if (src && !seen.has(src.url)) { seen.add(src.url); sources.push(src); } }
    if (!sources.length) return demo();
    leadSources = sources.slice(0, 1);
    leadLine = "TODAY'S TOP STORY (the reader is new; no interests known yet):";
    for (const src of sources.slice(1, MAX_STORIES + 1)) addItem('', [src]);
  } else {
    const news = await Promise.all(interests.map(async (topic) => ({ topic, sources: await newsFor(topic, services) })));
    const leadNews = news.find((n) => n.sources.length);
    for (const n of news) {
      if (n === leadNews) addItem(n.topic, n.sources.slice(1, 3));
      else if (n.sources.length) addItem(n.topic, n.sources.slice(0, 2));
      else quiet.push(n.topic);
    }
    // Nothing new on what they follow: the things they talked about carry the issue.
    const talkTopics = (ctx.talkTopics ?? []).slice(0, 3);
    const talkNews = talkTopics.length && (!leadNews || items.length < ALSO_MIN) ? await Promise.all(talkTopics.map(async (t) => ({ topic: t, sources: await newsFor(t, services, 2) }))) : [];
    for (const n of talkNews) addItem(n.topic, n.sources.slice(0, 2), 'your talks');
    // Adjacent topics fill the carousel and give "Also in this issue" something related.
    if (items.length < FEATURED - 1 + ALSO_MIN) {
      const related = await relatedTopics(profile, services.llm);
      const relatedNews = await Promise.all(related.map(async (r) => ({ ...r, sources: await newsFor(r.topic, services, 2) })));
      for (const n of relatedNews) addItem(n.topic, n.sources.slice(0, 2), n.because || interests[0]!);
    }
    const leadFrom = leadNews ?? (talkNews.find((n) => n.sources.length) as { topic: string; sources: Source[] } | undefined);
    if (leadFrom) {
      leadSources = leadFrom.sources.slice(0, 3);
      leadTopic = leadFrom.topic;
      leadLine = leadNews ? `TODAY'S STORY, from the reader's interest "${leadTopic}":` : `TODAY'S STORY, about something the reader talked about recently ("${leadTopic}"):`;
      if (!leadNews) items.splice(items.findIndex((it) => it.topic === leadTopic), 1);
    } else {
      const subject = profile.curiosities[0] ?? interests[0] ?? 'how AI models work';
      leadTopic = interests[0] ?? '';
      leadLine = `NO NEWS TODAY. Explain: ${subject}`;
    }
  }
  items.forEach((it, i) => (it.item = i + 1));

  // 2. Write the lead and the stories.
  const leadTask = services.llm.completeJson(
    {
      system: LEAD_DECK_PROMPT,
      messages: [{ role: 'user', content: [learnerBlock(profile, !leadSources.length), leadLine, sourcesBlock(leadSources)].join('\n\n') }],
      tier: 'main',
      temperature: 0.7,
      maxOutputTokens: 6000,
      timeoutMs: 45_000,
    },
    looseLead.nullable(),
    () => null,
  );
  const [leadRes, written] = await Promise.all([leadTask, writeStories(profile, items, services)]);
  const video = await findVideo(leadRes.data?.title ?? leadSources[0]?.title ?? leadTopic, services.search).catch(() => null);

  const lead = leadRes.data ? assembleLead(leadRes.data, leadSources, video) : null;
  if (!lead) {
    console.warn(`[issues] lead deck unusable (${leadRes.data ? 'too few valid cards' : 'no valid JSON'} from ${leadRes.provider}); using the demo issue`);
    if (leadRes.data && process.env.NODE_ENV !== 'test') console.warn(`[issues] lead JSON: ${truncate(JSON.stringify(leadRes.data), 1500)}`);
    return demo();
  }
  const leadSubject = typeof leadRes.data?.topic === 'string' && leadRes.data.topic.trim() ? truncate(String(leadRes.data.topic).trim(), 40) : '';

  const stories = written.stories;
  for (const it of items) if (it.topic && !it.relatedTo && !stories.some((st) => st.topic === it.topic)) quiet.push(it.topic);

  // 3. The carousel: the lead, then the reader's own interests (and, for a new reader, the top stories), then related ones.
  const own = stories.map((st, i) => ({ st, i })).filter(({ st }) => !st.relatedTo);
  const rel = stories.map((st, i) => ({ st, i })).filter(({ st }) => st.relatedTo);
  const featured = [...own, ...rel].slice(0, FEATURED - 1).map(({ i }) => i);

  return {
    lead: { ...lead, topic: discover ? leadSubject || 'Today' : leadTopic, relatedTo: '', sources: leadSources },
    stories,
    featured,
    quiet: interests.filter((i) => quiet.includes(i)),
    discover,
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
    title: d.title, topic: d.topic, relatedTo: d.relatedTo ?? '', art: d.art, cards: d.cards, summary: d.summary, teach: d.teach, quiz: d.quiz, sources: d.sources ?? [],
  });
}

async function loadIssue(userId: unknown, date: string): Promise<Issue | null> {
  const issue = await IssueModel.findOne({ userId, date });
  if (!issue) return null;
  const decks = await DeckModel.find({ _id: { $in: [issue.leadId, ...issue.storyIds] } });
  const byId = new Map(decks.map((d) => [d._id.toString(), d]));
  const lead = byId.get(issue.leadId.toString());
  if (!lead) return null;
  const stories = issue.storyIds.map((id) => byId.get(id.toString())).filter((d): d is DeckDoc => !!d).map(toDeck);
  const featuredIds = issue.featuredIds?.length ? issue.featuredIds.map((id) => id.toString()) : stories.slice(0, FEATURED - 1).map((d) => d.id);
  return {
    no: issue.no,
    date,
    lead: toDeck(lead),
    stories,
    featured: [lead._id.toString(), ...featuredIds.filter((id) => stories.some((d) => d.id === id))],
    quiet: issue.quiet ?? [],
    discover: !!issue.discover,
  };
}

async function backIssues(userId: unknown, exclude: string[]) {
  const decks = await DeckModel.find({ userId, kind: { $in: ['lead', 'chat', 'talk', 'demo'] }, _id: { $nin: exclude } })
    .sort({ createdAt: -1 })
    .limit(12);
  return decks.map(toDeckSummary);
}

/** Topics from the reader's recent talks that are not interests yet, newest first. */
async function recentTalkTopics(user: UserDoc): Promise<string[]> {
  const lower = new Set(userProfile(user).interests.map((i) => i.toLowerCase()));
  const talks = await TalkSession.find({ userId: user._id }).sort({ createdAt: -1 }).limit(8).select('topic');
  return [...new Set(talks.map((t) => t.topic.trim()).filter((t) => t && !lower.has(t.toLowerCase())))];
}

async function buildIssue(user: UserDoc, date: string, services: IssueServices): Promise<Issue> {
  const drafts = await draftIssue(userProfile(user), services, { talkTopics: await recentTalkTopics(user) });
  // Someone else may have finished first while the model was writing.
  const existing = await loadIssue(user._id, date);
  if (existing) return existing;

  const no = await nextNumber(user._id);
  const demo = drafts.provider === 'demo';
  const tagFor = (d: DeckDraft) => (demo ? DEMO_TAG : d.relatedTo === 'your talks' ? 'from your talks' : d.relatedTo ? `because you follow ${d.relatedTo}` : 'today');
  const lead = await saveDeck(user._id, no, demo ? 'demo' : 'lead', demo ? DEMO_TAG : 'today', drafts.lead, drafts.provider, date);
  const stories = await Promise.all(drafts.stories.map((s) => saveDeck(user._id, no, 'story', tagFor(s), s, drafts.provider, date)));
  const featuredIds = drafts.featured.map((i) => stories[i]?._id).filter((id): id is NonNullable<typeof id> => !!id);
  try {
    await IssueModel.create({ userId: user._id, date, no, leadId: lead._id, storyIds: stories.map((s) => s._id), featuredIds, quiet: drafts.quiet, discover: drafts.discover });
  } catch (err) {
    // A duplicate key means a parallel request saved the issue first: drop ours, use theirs.
    if ((err as { code?: number }).code !== 11000) throw err;
    await DeckModel.deleteMany({ _id: { $in: [lead._id, ...stories.map((s) => s._id)] } });
    const winner = await loadIssue(user._id, date);
    if (winner) return winner;
    throw err;
  }
  return { no, date, lead: toDeck(lead), stories: stories.map(toDeck), featured: [lead._id.toString(), ...featuredIds.map((id) => id.toString())], quiet: drafts.quiet, discover: drafts.discover };
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

export async function deckFromConversation(user: UserDoc, conversationId: string, title: string, transcript: string, sources: Source[], messageCount: number, llm: LlmService): Promise<Deck> {
  // One deck per conversation: a chat that has not grown since gets the same cards back.
  const existing = await DeckModel.findOne({ userId: user._id, conversationId });
  if (existing && (existing.messageCount ?? 0) >= messageCount) return toDeck(existing);
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
    const subject = typeof data.topic === 'string' && data.topic.trim() ? truncate(data.topic.trim(), 40) : '';
    draft = { title: truncate(data.title, 80), topic: subject, art: toArtKey(data.art), cards, summary: summaryOf(data.summary, data.title), teach: validTeach(data.teach, data.title), quiz: validQuiz(data.quiz, 3), sources };
  } else {
    // No model: cut the last answer into cards, paragraph by paragraph.
    const paras = transcript.split(/\n{2,}/).map((p) => p.replace(/^(CurioX|Learner):\s*/, '').replace(/[*_#>`]/g, '').trim()).filter((p) => p.length > 30);
    draft = {
      title: truncate(title, 80), topic: '', art: 'speech', sources, quiz: [], teach: fallbackTeach(title), summary: summaryOf(null, title),
      cards: (paras.length ? paras : [transcript]).slice(-3).map((p, i) => ({ kind: 'simple', h: i ? `Part ${i + 1}` : truncate(title, 48), body: truncate(p, 360), art: 'speech', note: '', source: null })),
    };
  }
  if (existing) {
    existing.set({ title: draft.title, topic: draft.topic, art: draft.art, cards: draft.cards, summary: draft.summary, teach: draft.teach, quiz: draft.quiz, sources: draft.sources, provider: data ? provider : 'demo', messageCount });
    return toDeck(await existing.save());
  }
  const no = await nextNumber(user._id);
  const deck = await saveDeck(user._id, no, 'chat', 'from your chat', draft, data ? provider : 'demo', null);
  deck.set({ conversationId, messageCount });
  return toDeck(await deck.save());
}

/** The summary of a finished talk: its key points, one card each. */
export async function deckFromTalkSummary(user: UserDoc, topic: string, keyPoints: string[], points: { h: string; say: string }[]): Promise<Deck | null> {
  const cards = validCards(keyPoints.map((k, i) => ({ kind: 'simple', h: points[i]?.h && points[i]!.h.length <= 48 ? points[i]!.h : `Takeaway ${i + 1}`, body: k, art: 'speech', note: '', source: null })));
  if (!cards.length) return null;
  const title = truncate(topic.charAt(0).toUpperCase() + topic.slice(1), 60);
  const no = await nextNumber(user._id);
  return toDeck(await saveDeck(user._id, no, 'talk', 'from your talk', { title, topic: '', art: 'speech', cards, quiz: [], teach: fallbackTeach(title), summary: summaryOf(keyPoints.slice(0, 2).join(' '), title) }, 'demo', null));
}

export async function deckFromTalk(user: UserDoc, title: string | undefined, points: { h: string; say: string }[]): Promise<Deck> {
  const cards = validCards(points.map((p) => ({ kind: 'simple', h: p.h, body: p.say, art: 'speech', note: '', source: null })));
  const name = title?.trim() || truncate(points[0]?.h ?? 'Your talk', 60);
  const no = await nextNumber(user._id);
  const draft: DeckDraft = { title: name, topic: '', art: 'speech', cards, quiz: [], teach: fallbackTeach(name), summary: summaryOf(points.slice(0, 2).map((p) => p.say).join(' '), name) };
  return toDeck(await saveDeck(user._id, no, 'talk', 'from your talk', draft, 'demo', null));
}

/** Today's issue as the app sees it, or null if none has been made yet. */
export async function todayIfMade(user: UserDoc, date: string): Promise<Issue | null> {
  return loadIssue(user._id, date);
}

/**
 * After a talk the reader cared about: find news on the topic and, if there is any, add a short
 * story deck to today's issue so it shows on Home under that interest. Returns the deck id or null.
 */
export async function addTopicStory(user: UserDoc, topic: string, date: string, services: IssueServices): Promise<string | null> {
  if (services.llm.demoMode) return null;
  const issue = await IssueModel.findOne({ userId: user._id, date });
  if (!issue) return null;
  const { sources, origin } = await services.search.search(`latest ${topic} news`, { topic: 'news', days: 3, max: 3 }).catch(() => ({ sources: [] as Source[], origin: 'none' as const }));
  if (origin === 'demo' || !sources.length) return null;
  const profile = userProfile(user);
  const item: StoryItem = { item: 1, topic, sources: sources.map((s, k) => ({ ...s, id: k + 1 })) };
  const { data, provider } = await services.llm.completeJson(
    {
      system: STORY_DECKS_PROMPT,
      messages: [{ role: 'user', content: [learnerBlock(profile), `ITEM 1: the reader's new interest "${topic}"\n${sourcesBlock(item.sources)}`].join('\n\n') }],
      tier: 'main',
      temperature: 0.7,
      maxOutputTokens: 2500,
      timeoutMs: 25_000,
    },
    looseStories.nullable(),
    () => null,
  );
  const story = data ? assembleStories(data, [item])[0] : undefined;
  if (!story) return null;
  const deck = await saveDeck(user._id, issue.no, 'story', 'from your talk', story, provider, date);
  await IssueModel.updateOne({ _id: issue._id }, { $push: { storyIds: deck._id }, $pull: { quiet: topic } });
  return deck._id.toString();
}

export async function getDeck(user: UserDoc, id: string): Promise<Deck | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const d = await DeckModel.findOne({ _id: id, userId: user._id });
  return d ? toDeck(d) : null;
}
