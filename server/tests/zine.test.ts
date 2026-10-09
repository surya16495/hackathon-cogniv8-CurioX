import { describe, expect, it } from 'vitest';
import { cardSchema } from '@curiox/shared';
import { DeckModel, IssueModel } from '../src/db/models';
import { assembleLead, issueDate, youtubeId } from '../src/services/issues';
import { roughMark } from '../src/services/learn/talk';
import { client, fakeProvider, fakeSearcher, makeApp } from './helpers';

const reader = {
  interests: ['Cricket', 'Space'], level: ['I watch every match'], goals: ['Pure curiosity'],
  style: ['Analogies'], tone: ['Witty'], curious: ['How does DRS actually work?'],
};

const lead = {
  title: 'Rockets that land themselves',
  art: 'rocket',
  hook: { lead: 'A rocket booster just landed for the 20th time.', art: 'rocket' },
  what: { title: 'What happened', strips: ['A booster flew again.', 'It landed upright.', 'It was its 20th flight.'], sourceIndex: 1, art: 'megaphone' },
  why: { body: 'Cheaper launches mean more satellites and missions.', note: 'picked for you: you follow every launch', art: 'eyes' },
  myth: { claim: 'Reused rockets are less safe', answer: 'myth', explain: 'Each landing is inspected and the record is strong.' },
  ways: { question: 'Why reuse a booster?', note: 'the cricket one is there because you follow cricket', ways: [
    { label: "Like I'm 10", text: 'Throwing away a plane after one flight would be silly.' },
    { label: 'In cricket', text: 'Like keeping the same bat for the whole season.' },
    { label: 'Technical', text: 'Recovering the first stage removes the biggest hardware cost.' },
  ] },
  vs: { title: 'Reused vs new', left: { label: 'Reused', art: 'recycle' }, right: { label: 'New', art: 'gift' }, rows: [
    { k: 'Cost', l: 'Cheaper', r: 'Pricier', more: 'Hardware is the big cost.' },
    { k: 'Wait', l: 'Weeks', r: 'Months', more: 'Building takes longer than checking.' },
  ] },
  guess: { question: 'How many times has one booster flown?', min: 1, max: 40, answer: 20, unit: 'flights', explain: 'Some boosters have flown twenty times.' },
  teach: { q: 'Why reuse boosters? One sentence.', sample: 'Reusing the costliest part makes launches cheaper.', add: 'the booster is the priciest part' },
  quiz: [
    { q: 'What gets reused?', opts: ['The booster', 'The fuel', 'The payload', 'The pad'], a: 0, why: 'The booster lands.', tag: 'what lands', re: 'Like a taxi doing many rides.' },
    { q: 'Bad', opts: ['a', 'a', 'b', 'c'], a: 0, why: 'w', tag: 't', re: 'r' },
  ],
  thumbTitle: 'Landing rockets',
};

const stories = { stories: [{ item: 1, title: 'Dew decides night games', art: 'droplet', sourceIndex: 1, cards: [
  { h: 'Dew is back', body: 'Night games get wet.', art: 'droplet' },
  { h: 'Why it matters', body: 'Wet balls skid.', art: 'cricket', note: 'for you: you follow cricket' },
  { h: 'Watch for', body: 'Towels on the field.', art: 'eyes' },
], teach: { q: 'Why does dew matter? One sentence.', sample: 'A wet ball is hard to grip.', add: 'captains bowl first' }, quiz: [] }] };

/** One fake model that answers each job by its system prompt. */
function zineModel(overrides: Partial<Record<'lead' | 'stories' | 'talk' | 'teach' | 'tailor' | 'chatdeck', unknown>> = {}) {
  return fakeProvider({
    name: 'groq',
    complete: (req) => {
      const s = req.system;
      const pick = (k: keyof typeof overrides, v: unknown) => JSON.stringify(k in overrides ? overrides[k] : v);
      if (s.includes('lead story')) return pick('lead', lead);
      if (s.includes('short story decks')) return pick('stories', stories);
      if (s.includes('"points"')) return pick('talk', { points: [{ h: 'Short answer', say: 'It is all about grip.' }, { h: 'Why', say: 'Wet balls slip.' }] });
      if (s.includes('verdict')) return pick('teach', { verdict: 'got_it', feedback: 'Nailed it.', add: 'mention the toss.' });
      if (s.includes('onboarding chips')) return pick('tailor', { regular: 'I throw pots weekly', goals: ['Sell my pots'], curious: ['Why do pots crack?', 'What is a glaze?', 'Which clay is best?'] });
      if (s.includes('Turn this conversation')) return pick('chatdeck', { title: 'Tides', art: 'wave', cards: [{ h: 'Moon pulls', body: 'The moon pulls the sea.', art: 'moon' }, { h: 'Twice a day', body: 'Two bulges.', art: 'wave' }], teach: lead.teach, quiz: [] });
      return '{"needsSearch":false,"query":""}';
    },
    stream: async function* () {
      yield 'Tides come from the moon.';
    },
  });
}

const news = (topic: string) => [
  { title: `${topic} story one`, url: `https://news.example/${topic}/1`, snippet: `Something new in ${topic}.` },
  { title: `${topic} story two`, url: `https://news.example/${topic}/2`, snippet: `More ${topic}.` },
];

describe('onboarding: reader card', () => {
  it('tailors questions to the picked interests without a model call for known ones', async () => {
    const model = zineModel();
    const { app } = makeApp({ providers: [model] });
    const res = await client(app).post('/api/onboarding/tailor').send({ interests: ['Cricket'] });
    expect(res.status).toBe(200);
    expect(res.body.questions.map((q: { key: string }) => q.key)).toEqual(['level', 'goals', 'style', 'tone', 'curious']);
    expect(res.body.questions[0].q).toBe('How much do you already know about cricket?');
    expect(model.completeCalls).toHaveLength(0);
  });

  it('asks the model for interests it does not know, and falls back when it fails', async () => {
    const model = zineModel();
    const { app } = makeApp({ providers: [model] });
    const res = await client(app).post('/api/onboarding/tailor').send({ interests: ['Pottery'] });
    expect(res.body.provider).toBe('groq');
    expect(res.body.questions[0].options[2]).toBe('I throw pots weekly');
    expect(res.body.questions[1].options).toContain('Sell my pots');
    expect(res.body.questions[4].options).toEqual(['Why do pots crack?', 'What is a glaze?', 'Which clay is best?']);

    const broken = makeApp({ providers: [zineModel({ tailor: { regular: '' } })] });
    const res2 = await client(broken.app).post('/api/onboarding/tailor').send({ interests: ['Pottery'] });
    expect(res2.body.provider).toBe('demo');
    expect(res2.body.questions[0].options[2]).toBe('I keep up with it');
  });

  it('rejects an empty interest list', async () => {
    const { app } = makeApp();
    expect((await client(app).post('/api/onboarding/tailor').send({ interests: [] })).status).toBe(400);
  });

  it('saves the card as the profile and marks onboarding complete', async () => {
    const { app } = makeApp();
    const c = client(app);
    const res = await c.post('/api/onboarding/complete').send({ reader });
    expect(res.status).toBe(200);
    expect(res.body.onboarding.status).toBe('completed');
    expect(res.body.profile).toMatchObject({
      interests: ['Cricket', 'Space'], tone: 'Witty', explanationStyle: 'Analogies',
      knowledgeLevels: [{ topic: 'Cricket', level: 'intermediate' }, { topic: 'Space', level: 'intermediate' }], reader,
    });
    // Editing the card later re-derives the profile.
    const put = await c.put('/api/profile').send({ reader: { ...reader, interests: ['Music'], tone: ['Calm'] } });
    expect(put.body.profile).toMatchObject({ interests: ['Music'], tone: 'Calm', reader: { interests: ['Music'] } });
  });

  it('an empty card counts as skipped', async () => {
    const { app } = makeApp();
    const empty = { interests: [], level: [], goals: [], style: [], tone: [], curious: [] };
    const res = await client(app).post('/api/onboarding/complete').send({ reader: empty });
    expect(res.body.onboarding.status).toBe('skipped');
  });
});

describe('GET /api/issues/today', () => {
  it('demo mode makes a labelled, evergreen demo issue with stories for known interests', async () => {
    const { app } = makeApp();
    const c = client(app);
    await c.post('/api/onboarding/complete').send({ reader: { ...reader, interests: ['Cricket', 'Pottery'] } });
    const res = await c.get('/api/issues/today?date=2026-10-09').query({ date: new Date().toISOString().slice(0, 10) });
    expect(res.status).toBe(200);
    const { issue } = res.body;
    expect(issue.no).toBe(1);
    expect(issue.lead).toMatchObject({ kind: 'demo', tag: 'demo issue', provider: 'demo' });
    expect(issue.lead.cards[0].kind).toBe('hook');
    expect(issue.lead.cards.every((card: unknown) => cardSchema.safeParse(card).success)).toBe(true);
    expect(issue.stories.map((s: { topic: string }) => s.topic)).toEqual(['Cricket']);
    expect(issue.quiet).toEqual(['Pottery']);
  });

  it('makes the issue once per day and returns the same one after', async () => {
    const { app } = makeApp();
    const c = client(app);
    const date = new Date().toISOString().slice(0, 10);
    const [a, b] = await Promise.all([c.get(`/api/issues/today?date=${date}`), c.get(`/api/issues/today?date=${date}`)]);
    expect(a.body.issue.lead.id).toBe(b.body.issue.lead.id);
    const again = await c.get(`/api/issues/today?date=${date}`);
    expect(again.body.issue.lead.id).toBe(a.body.issue.lead.id);
    expect(await IssueModel.countDocuments({ date })).toBeGreaterThanOrEqual(1);
  });

  it('builds the lead from news, the stories from each interest, and adds a YouTube card', async () => {
    const model = zineModel();
    const searcher = {
      calls: [] as string[],
      available: () => true,
      async search(query: string, _max: number, opts?: { includeDomains?: string[] }) {
        searcher.calls.push(query);
        if (opts?.includeDomains?.includes('youtube.com')) return [{ title: 'Booster landing explained - YouTube', url: 'https://www.youtube.com/watch?v=abcDEF12345', snippet: '' }];
        if (query.includes('Cricket')) return news('Cricket');
        return news('Space');
      },
    };
    const { app } = makeApp({ providers: [model], searcher });
    const c = client(app);
    await c.post('/api/onboarding/complete').send({ reader });
    const res = await c.get('/api/issues/today');
    expect(res.status).toBe(200);
    const { lead: deck, stories: decks, quiet } = res.body.issue;
    expect(deck).toMatchObject({ kind: 'lead', tag: 'today', provider: 'groq', topic: 'Cricket', title: 'Rockets that land themselves' });
    expect(deck.cards.map((card: { kind: string }) => card.kind)).toEqual(['hook', 'what', 'why', 'myth', 'ways', 'vs', 'guess', 'watch']);
    expect(deck.cards[1].source).toMatchObject({ url: 'https://news.example/Cricket/1', site: 'news.example' });
    expect(deck.cards[3].claim).toBe('“Reused rockets are less safe”');
    expect(deck.cards[7].video).toMatchObject({ videoId: 'abcDEF12345', title: 'Booster landing explained' });
    expect(deck.quiz).toHaveLength(1); // the one with duplicate options is dropped
    expect(deck.sources).toHaveLength(2);
    expect(decks.map((s: { topic: string }) => s.topic)).toEqual(['Cricket']);
    expect(quiet).toEqual(['Space']); // the model wrote no story for item 2
    // The model never saw a URL it could invent: the source came from search.
    const leadCall = model.completeCalls.find((r) => r.system.includes('lead story'))!;
    expect(leadCall.messages[0]!.content).toContain('[1] Cricket story one');
  });

  it('drops bad cards and falls back to the demo issue when the lead is unusable', async () => {
    const searcher = fakeSearcher(news('Space'));
    const bad = makeApp({ providers: [zineModel({ lead: { ...lead, guess: { ...lead.guess, answer: 99 }, vs: { title: 'x' } } })], searcher });
    const c = client(bad.app);
    await c.post('/api/onboarding/complete').send({ reader });
    const res = await c.get('/api/issues/today');
    expect(res.body.issue.lead.cards.map((card: { kind: string }) => card.kind)).toEqual(['hook', 'what', 'why', 'myth', 'ways']);

    const worse = makeApp({ providers: [zineModel({ lead: { title: 'x', hook: { lead: 'y' } } })], searcher });
    const c2 = client(worse.app);
    const res2 = await c2.get('/api/issues/today');
    expect(res2.body.issue.lead.kind).toBe('demo');
  });

  it('DELETE forgets today so the next GET makes a new issue with the next number', async () => {
    const { app } = makeApp();
    const c = client(app);
    const first = await c.get('/api/issues/today');
    expect((await c.delete('/api/issues/today')).status).toBe(204);
    const second = await c.get('/api/issues/today');
    expect(second.body.issue.lead.id).not.toBe(first.body.issue.lead.id);
    expect(second.body.issue.no).toBe(2);
    expect(await DeckModel.findById(first.body.issue.lead.id)).toBeNull();
  });

  it('ignores an implausible date', () => {
    const now = new Date('2026-10-09T23:30:00Z');
    expect(issueDate('2026-10-10', now)).toBe('2026-10-10');
    expect(issueDate('2026-10-08', now)).toBe('2026-10-08');
    expect(issueDate('2026-12-25', now)).toBe('2026-10-09');
    expect(issueDate('not a date', now)).toBe('2026-10-09');
    expect(issueDate(undefined, now)).toBe('2026-10-09');
  });
});

describe('decks', () => {
  it('staples a talk into a deck with the next number', async () => {
    const { app } = makeApp();
    const c = client(app);
    const res = await c.post('/api/decks').send({ from: 'talk', points: [{ h: 'Fewer dials', say: 'Small models are fast.' }, { h: 'Cheap', say: 'They cost less.' }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'talk', tag: 'from your talk', title: 'Fewer dials', no: 1 });
    expect(res.body.cards).toHaveLength(2);
    expect((await c.get(`/api/decks/${res.body.id}`)).body.id).toBe(res.body.id);
    const today = await c.get('/api/issues/today');
    expect(today.body.backIssues.map((d: { id: string }) => d.id)).toContain(res.body.id);
    expect(today.body.issue.no).toBe(2);
  });

  it('turns a chat into cards, and keeps other people’s decks private', async () => {
    const { app } = makeApp({ providers: [zineModel()] });
    const c = client(app);
    const chat = await c.post('/api/chat').send({ message: 'Why are there tides?', stream: false });
    const res = await c.post('/api/decks').send({ from: 'chat', conversationId: chat.body.conversationId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'chat', title: 'Tides', provider: 'groq' });
    expect((await client(app).get(`/api/decks/${res.body.id}`)).status).toBe(404);
    expect((await c.get('/api/decks/nope')).status).toBe(404);
    expect((await c.post('/api/decks').send({ from: 'chat', conversationId: 'a'.repeat(24) })).status).toBe(404);
  });

  it('a chat deck without a model is cut from the answer', async () => {
    const { app } = makeApp();
    const c = client(app);
    const chat = await c.post('/api/chat').send({ message: 'Why are there tides?', stream: false });
    const res = await c.post('/api/decks').send({ from: 'chat', conversationId: chat.body.conversationId });
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('demo');
    expect(res.body.cards.length).toBeGreaterThan(0);
  });
});

describe('talk and teach', () => {
  it('talk returns spoken points', async () => {
    const { app } = makeApp({ providers: [zineModel()] });
    const res = await client(app).post('/api/talk').send({ message: 'Why does dew matter?' });
    expect(res.body).toMatchObject({ provider: 'groq', reply: 'It is all about grip. Wet balls slip.' });
    expect(res.body.points).toHaveLength(2);
  });

  it('talk without a model says it is offline, in points', async () => {
    const { app } = makeApp();
    const res = await client(app).post('/api/talk').send({ message: 'Hi', history: [{ role: 'assistant', content: 'Hello' }] });
    expect(res.body.provider).toBe('demo');
    expect(res.body.points[0].h).toBe('I am offline');
  });

  it('teach marks an answer and tidies the "add" line', async () => {
    const { app } = makeApp({ providers: [zineModel()] });
    const res = await client(app).post('/api/talk/teach').send({ q: 'Why dew?', said: 'The ball gets wet.', sample: 'A wet ball is hard to grip.' });
    expect(res.body).toMatchObject({ verdict: 'got_it', feedback: 'Nailed it.', add: 'mention the toss' });
  });

  it('teach without a model marks by overlap', async () => {
    expect(roughMark('a wet ball is slippery to grip', 'A wet ball is hard to grip.')).toBe('got_it');
    expect(roughMark('no idea', 'A wet ball is hard to grip.')).toBe('not_yet');
    const { app } = makeApp();
    const res = await client(app).post('/api/talk/teach').send({ q: 'Why dew?', said: 'no idea', sample: 'A wet ball is hard to grip.' });
    expect(res.body.verdict).toBe('not_yet');
  });
});

describe('helpers', () => {
  it('reads YouTube ids from every link shape', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abcDEF12345&t=3')).toBe('abcDEF12345');
    expect(youtubeId('https://youtu.be/abcDEF12345')).toBe('abcDEF12345');
    expect(youtubeId('https://m.youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345');
    expect(youtubeId('https://www.youtube.com/@channel')).toBeNull();
    expect(youtubeId('https://vimeo.com/123456')).toBeNull();
    expect(youtubeId('nope')).toBeNull();
  });

  it('assembleLead needs a hook and four cards', () => {
    expect(assembleLead({ title: 'x', hook: { lead: 'y' } }, [], null)).toBeNull();
    const ok = assembleLead(lead as never, [], null)!;
    expect(ok.cards[1]).toMatchObject({ kind: 'what', source: null });
  });
});
