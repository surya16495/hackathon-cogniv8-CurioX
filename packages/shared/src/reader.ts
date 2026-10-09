// The six reader-card questions, and how questions 2 to 6 follow the interests picked in question 1.
// tailorQuestions() is instant and offline; the server can enrich it with a model for unusual interests.
import type { KnowledgeLevel, Profile } from './types';
import type { ReaderCard, ReaderKey, ReaderQuestion } from './zine';

export const INTEREST_OPTIONS = [
  'Artificial intelligence', 'Cricket', 'Space', 'Personal finance', 'Design',
  'History', 'Health', 'Climate', 'Startups', 'Music',
] as const;

export const TONE_OPTIONS = ['Friendly', 'Casual', 'Playful', 'Witty', 'Calm', 'Like a coach'];
const BASE_GOALS = ['Keep up with the news', 'Get better at my job', 'Change careers', 'Pass an exam', 'Pure curiosity'];
const BASE_STYLE = ['Analogies', 'Step by step', 'Real examples', 'Straight to the point', 'Pictures'];
const BASE_CURIOUS = ['Why do chatbots make things up?', 'What is an AI agent?', 'How do AI models learn?', 'Will AI take my job?'];

/** Short names used in question text and chips: "How much do you already know about AI?" */
export const TOPIC_SHORT: Record<string, string> = { 'Artificial intelligence': 'AI', 'Personal finance': 'money' };
export const topicShort = (t: string) => TOPIC_SHORT[t] ?? t.toLowerCase();
/** Group headings on Home use title case. */
export const topicName = (t: string) => ({ 'Artificial intelligence': 'AI', 'Personal finance': 'Money' } as Record<string, string>)[t] ?? t;

interface TopicBank {
  /** The third level option, in the words of someone who follows this topic. */
  regular: string;
  goals: string[];
  curious: string[];
}

const BANK: Record<string, TopicBank> = {
  'Artificial intelligence': {
    regular: 'I use it every week',
    goals: ['Use AI tools at work', 'Build things with AI'],
    curious: ['Why do chatbots make things up?', 'What is an AI agent?', 'How do AI models learn?', 'Will AI take my job?'],
  },
  Cricket: {
    regular: 'I watch every match',
    goals: ['Follow matches like a pro', 'Play better myself'],
    curious: ['Why does dew matter in night matches?', 'How does DRS actually work?', 'Why does strike rate rule T20?', 'What makes a ball swing?'],
  },
  Space: {
    regular: 'I follow every launch',
    goals: ['Follow launches and missions', 'Understand the universe better'],
    curious: ['How do rockets land themselves?', 'What is a black hole, really?', 'Could we actually live on Mars?', 'Why is space dark if stars are bright?'],
  },
  'Personal finance': {
    regular: 'I invest already',
    goals: ['Make smarter money moves', 'Start investing'],
    curious: ['What is the rule of 72?', 'Index funds or single stocks?', 'How does inflation eat my savings?', 'What makes a good credit score?'],
  },
  Design: {
    regular: 'I design for work',
    goals: ['Design better things at work', 'Build a portfolio'],
    curious: ['Why do some apps just feel right?', 'How do colours change how we feel?', 'What makes a logo work?', 'What is UX, exactly?'],
  },
  History: {
    regular: 'I read history for fun',
    goals: ['Understand today through the past', 'Win every history argument'],
    curious: ['Why did the Roman Empire fall?', 'How did the printing press change everything?', 'What really started World War I?', 'Who built the first cities?'],
  },
  Health: {
    regular: 'I track my health',
    goals: ['Build healthier habits', 'Understand my body'],
    curious: ['How much sleep do I really need?', 'Is sugar really that bad?', 'What does exercise do to the brain?', 'How do vaccines work?'],
  },
  Climate: {
    regular: 'I follow climate news',
    goals: ['Make sense of climate news', 'Live a bit greener'],
    curious: ['How do heat pumps work?', 'Is nuclear power green?', 'Why are summers getting hotter?', 'Do electric cars really help?'],
  },
  Startups: {
    regular: 'I work at one',
    goals: ['Start something of my own', 'Get better at my startup job'],
    curious: ['How do startups raise money?', 'What is product-market fit?', 'Why do most startups fail?', 'What does a VC actually do?'],
  },
  Music: {
    regular: 'I play an instrument',
    goals: ['Play or make music', 'Listen with new ears'],
    curious: ['Why do songs get stuck in my head?', 'How does autotune work?', 'What makes a chord sound sad?', 'How do streaming royalties work?'],
  },
};

export const LEVEL_WORDS = ['Just curious', 'I know the basics', '', 'I could teach it'];

const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Take from each list in turn, so every picked interest gets a say. */
function roundRobin(lists: string[][], max: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (l[i] && !out.includes(l[i]!) && out.length < max) out.push(l[i]!);
  }
  return out;
}

export function interestsQuestion(): ReaderQuestion {
  return {
    key: 'interests', label: 'Into', q: 'What are you into?', hint: 'Pick as many as you like.', multi: true, free: true,
    options: [...INTEREST_OPTIONS],
  };
}

/** Questions 2 to 5 for these interests. Interests outside the bank get the general options. */
export function tailorQuestions(interests: string[]): ReaderQuestion[] {
  const picked = interests.filter(Boolean);
  const first = picked[0];
  const banks = picked.map((t) => BANK[t]).filter((b): b is TopicBank => !!b);
  const firstBank = first ? BANK[first] : undefined;
  const about = !first ? 'the things you follow' : topicShort(first);

  const goals = unique([BASE_GOALS[0]!, ...roundRobin(banks.map((b) => b.goals), 3), ...BASE_GOALS.slice(1)]).slice(0, 6);
  const style = unique([...BASE_STYLE.slice(0, 3), first ? `${capital(topicShort(first))} examples` : '', ...BASE_STYLE.slice(3)]);
  return [
    {
      key: 'level', label: 'Level', q: `How much do you already know about ${about}?`, hint: 'Pick one.', multi: false,
      options: [LEVEL_WORDS[0]!, LEVEL_WORDS[1]!, firstBank?.regular ?? 'I keep up with it', LEVEL_WORDS[3]!],
    },
    { key: 'goals', label: 'Learning for', q: 'What are you learning for?', hint: 'Pick as many as you like.', multi: true, options: goals },
    { key: 'style', label: 'Explain with', q: 'How should I explain things?', hint: 'Pick as many as you like.', multi: true, options: style },
    { key: 'tone', label: 'Tone', q: 'How should I sound?', hint: 'Pick one.', multi: false, options: [...TONE_OPTIONS] },
  ];
}

/** Questions a reader could still be wondering about, by interest: Ask's suggestions use them. */
export function wonderings(interests: string[]): string[] {
  const banks = interests.map((t) => BANK[t]).filter((b): b is TopicBank => !!b);
  return banks.length ? roundRobin(banks.map((b) => b.curious), 5) : BASE_CURIOUS;
}

const capital = (s: string) => (s.length <= 3 && s === s.toLowerCase() ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1));

export const READER_LABELS: Record<ReaderKey, string> = {
  interests: 'Into', level: 'Level', goals: 'Learning for', style: 'Explain with', tone: 'Tone', curious: 'Wondering',
};

export function blankReader(): ReaderCard {
  return { interests: [], level: [], goals: [], style: [], tone: [], curious: [] };
}

/** Map a level chip to beginner / intermediate / advanced. */
export function levelFromWords(words: string | undefined): KnowledgeLevel {
  const w = (words ?? '').toLowerCase();
  if (!w) return 'beginner';
  if (/teach|expert|pro\b|professional/.test(w)) return 'advanced';
  if (/curious|basics|new|never|little|beginner/.test(w)) return 'beginner';
  return 'intermediate';
}

/** The profile the prompts use, derived from the reader card. */
export function profileFromReader(reader: ReaderCard): Profile {
  const level = levelFromWords(reader.level[0]);
  return {
    interests: unique(reader.interests),
    knowledgeLevels: unique(reader.interests).map((topic) => ({ topic, level })),
    goals: unique(reader.goals),
    explanationStyle: unique(reader.style).join(', '),
    tone: reader.tone[0] ?? '',
    curiosities: unique(reader.curious),
    reader,
  };
}

/** Rebuild a card for a profile made before the reader card existed. */
export function readerFromProfile(profile: Profile): ReaderCard {
  if (profile.reader) return { ...blankReader(), ...profile.reader };
  const lvl = profile.knowledgeLevels[0]?.level;
  return {
    interests: profile.interests,
    level: lvl ? [lvl === 'advanced' ? 'I could teach it' : lvl === 'intermediate' ? 'I keep up with it' : 'I know the basics'] : [],
    goals: profile.goals,
    style: profile.explanationStyle ? profile.explanationStyle.split(/,\s*/).filter(Boolean) : [],
    tone: profile.tone ? [profile.tone] : [],
    curious: profile.curiosities,
  };
}
