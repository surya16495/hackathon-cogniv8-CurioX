// The issue shown when no model is reachable (DEMO_MODE, or every provider failed).
// Evergreen, true content only: no invented news, no invented sources. Labelled "demo issue" in the app.
import type { Card, DeckQuizQuestion, TeachPrompt } from '@curiox/shared';
import type { ArtKey } from '@curiox/shared';

export interface DeckDraft {
  title: string;
  topic: string;
  art: ArtKey;
  cards: Card[];
  teach: TeachPrompt;
  quiz: DeckQuizQuestion[];
}

export const DEMO_TAG = 'demo issue';

export function demoLead(interests: string[]): DeckDraft {
  const hobby = interests.find((i) => i !== 'Artificial intelligence') ?? 'Cricket';
  const cricket = hobby === 'Cricket';
  return {
    title: 'Small AI models, big deal',
    topic: 'Artificial intelligence',
    art: 'robot',
    cards: [
      {
        kind: 'hook', title: 'Did you know?', art: 'robot', stickers: ['wow', 'mindblown', 'wow'],
        lead: 'Most AI tools you use every day run on small, fast models, not the giant ones in the headlines. Small is often the smart choice.',
      },
      {
        kind: 'what', title: 'The short version', art: 'megaphone', sticker: 'rocket', source: null,
        strips: ['Small models answer faster and cost less to run.', 'Big models cope better with long, many-step problems.', 'Most apps mix both: small for quick replies, big for hard jobs.'],
      },
      {
        kind: 'why', title: 'Why it matters to you', art: 'eyes',
        body: 'The writing and search tools you already use run on small, fast models. When a better one ships, those tools get quicker within weeks.',
        note: 'picked for you: it shows up in the apps you use',
      },
      {
        kind: 'myth', claim: '“AI models understand what they say.”', answer: 'myth', sticker: 'monocle', note: 'guess first, then the card flips',
        explain: 'A model predicts the next word from patterns in what it has read. Nothing inside it checks what is true, so it can sound sure and still be wrong.',
      },
      {
        kind: 'ways', question: 'What is a language model?', sticker: 'bulb',
        note: cricket ? 'the cricket one is there because you follow cricket' : `the ${hobby.toLowerCase()} one is there because you follow it`,
        ways: [
          { label: "Like I'm 10", art: 'child', text: 'It is a giant autocomplete. It read more books than a city full of libraries and learned which word usually comes next.' },
          cricket
            ? { label: 'In cricket', art: 'cricket', text: 'A batter who has faced a million balls does not do physics at the crease. They read the delivery from patterns. A model reads the next word the same way.' }
            : { label: `In ${hobby.toLowerCase()}`.slice(0, 24), art: 'sparkles', text: `Think of someone who has spent years around ${hobby.toLowerCase()}: they spot what comes next from patterns, without working it out step by step. A model does that with words.` },
          { label: 'Technical', art: 'microscope', text: 'A neural network trained to predict the next token from the tokens before it. Billions of parameters are tuned by gradient descent on a very large body of text.' },
        ],
      },
      {
        kind: 'vs', title: 'Small vs big', art: 'scales', sticker: 'zap',
        left: { label: 'Small', art: 'scooter' }, right: { label: 'Big', art: 'truck' },
        rows: [
          { k: 'Speed', l: 'Replies in a blink', r: 'Takes its time', more: 'A small model runs fewer calculations for every word, so the first word shows up sooner.' },
          { k: 'Cost', l: 'Cheap, often free', r: 'Costs more per word', more: 'A big model keeps more chips busy for longer. That bill gets passed on.' },
          { k: 'Best for', l: 'Chat, summaries, quick lookups', r: 'Hard reasoning, long documents', more: 'Most everyday questions never need the big one.' },
          { k: 'Hard problems', l: 'Slips more often', r: 'Slips less often', more: 'More parameters hold more patterns, so there are fewer gaps to fall into.' },
        ],
      },
      {
        kind: 'guess', question: 'GPT-3, the 2020 model that came before ChatGPT, had how many parameters?',
        min: 1, max: 500, answer: 175, unit: 'billion', art: 'target', sticker: 'thinking',
        explain: 'Parameters are the dials a model tunes while it learns. More dials can hold more patterns.',
      },
    ],
    teach: {
      q: 'What is a language model? Say it in one sentence.',
      sample: 'A language model guesses the next word using patterns from everything it has read.',
      add: 'nothing in it checks whether the guess is true',
    },
    quiz: [
      {
        q: 'What is a language model doing when it answers?', opts: ['Looking the answer up in a database', 'Predicting the next word from patterns', 'Copying a web page', 'Asking another AI'], a: 1,
        why: 'It predicts one word at a time. Nothing is looked up unless search is switched on.', tag: 'what a model is doing',
        re: 'Picture the autocomplete on your phone, grown huge. It never opens a reference book. It only continues the sentence with what usually comes next.',
      },
      {
        q: 'Why would an app choose a small model?', opts: ['It never makes mistakes', 'It is faster and cheaper', 'It knows more facts', 'It works without the internet'], a: 1,
        why: 'Fewer parameters mean less work per word: quicker replies and a smaller bill.', tag: 'why apps pick small models',
        re: 'A small model is a scooter and a big model is a truck. For a short trip across town the scooter gets there first and burns less fuel.',
      },
      {
        q: 'GPT-3 had about how many parameters?', opts: ['175 thousand', '175 million', '175 billion', '175 trillion'], a: 2,
        why: '175 billion dials, each one tuned during training.', tag: 'how big GPT-3 was',
        re: '175 billion is more than 20 dials for every person on Earth. Each dial is a number the model nudged while it was learning.',
      },
    ],
  };
}

const simple = (h: string, body: string, art: ArtKey, note = ''): Card => ({ kind: 'simple', h, body, art, note, source: null });

const STORIES: Record<string, DeckDraft> = {
  'Artificial intelligence': {
    title: 'What is an AI agent?', topic: 'Artificial intelligence', art: 'compass',
    cards: [
      simple('What is an AI agent?', 'A model that can take steps on its own: search, open a file, run a tool, then decide what to do next.', 'compass'),
      simple('A chatbot answers. An agent acts.', 'Ask a chatbot about flights and it gives advice. Ask an agent and it checks prices, compares dates and comes back with options.', 'plane'),
      simple('Where it goes wrong', 'Each step can carry a small mistake into the next one. Good agents show their steps so you can check them.', 'eyes'),
    ],
    teach: { q: 'What makes an agent different from a chatbot? One sentence.', sample: 'An agent takes steps and uses tools on its own, while a chatbot only answers.', add: 'good agents show their steps so you can check them' },
    quiz: [
      { q: 'What can an agent do that a plain chatbot cannot?', opts: ['Write longer answers', 'Use tools and take steps on its own', 'Work without electricity', 'Remember everything forever'], a: 1, why: 'An agent acts: it searches, opens files and runs tools, then decides the next step.', tag: 'what an agent does', re: 'A chatbot is a friend giving directions over the phone. An agent is the friend who drives while you watch the road.' },
      { q: 'Why should you check an agent’s steps?', opts: ['They are always wrong', 'A small early slip gets carried forward', 'Agents cannot read', 'It makes them faster'], a: 1, why: 'One mistake early on gets copied into every step that follows.', tag: 'why steps need checking', re: 'It is like a wrong turn at the start of a road trip: every turn after it takes you further off course.' },
    ],
  },
  Cricket: {
    title: 'Why captains fear the dew', topic: 'Cricket', art: 'droplet',
    cards: [
      simple('Why captains fear the dew', 'In a night match the grass gets wet. A wet ball is hard to grip, so bowlers lose control and spinners lose their turn.', 'droplet'),
      simple('So teams chase', 'Batting second gets easier as the ball skids onto the bat. That is why a captain who wins the toss at night often bowls first.', 'cricket'),
      simple('What to watch for', 'Fielders drying the ball with a towel between deliveries is the giveaway. From then on, expect more boundaries.', 'eyes', 'for you: you follow cricket'),
    ],
    teach: { q: 'Why does dew matter in a night match? One sentence.', sample: 'A wet ball is hard to grip, so bowling gets harder and chasing gets easier.', add: 'that is why captains who win the toss often bowl first' },
    quiz: [
      { q: 'What does dew do to the ball?', opts: ['Makes it swing more', 'Makes it wet and hard to grip', 'Makes it heavier to hit', 'Nothing'], a: 1, why: 'A wet ball slips in the hand, so bowlers lose control.', tag: 'what dew does to the ball', re: 'Try spinning a wet bar of soap. Spinners have the same problem with a wet ball.' },
      { q: 'A captain wins the toss in a dewy night match. What is the usual call?', opts: ['Bat first', 'Bowl first', 'Ask for a delay', 'It makes no difference'], a: 1, why: 'Bowling first means batting later, when the wet ball skids onto the bat.', tag: 'the toss call under dew', re: 'You want to be the side batting when the ball is at its most slippery, so you bowl while it is still dry.' },
    ],
  },
  Space: {
    title: 'Why rockets land themselves now', topic: 'Space', art: 'rocket',
    cards: [
      simple('Why rockets land themselves now', 'A rocket booster used to be thrown away after one flight. Now many fly back and land upright, ready to be used again.', 'rocket'),
      simple('How it lands', 'The booster flips around, relights its engines to slow down, steers with small fins and puts out legs just before touchdown.', 'zap'),
      simple('Why it matters', 'The booster is the most expensive part of the rocket. Reusing it makes each flight cheaper, so there are far more launches than ten years ago.', 'books'),
    ],
    teach: { q: 'Why do rockets land themselves now? One sentence.', sample: 'Boosters fly back and land so they can be used again, which makes launches cheaper.', add: 'the booster is the most expensive part of the rocket' },
    quiz: [
      { q: 'Before reuse, what happened to a booster after launch?', opts: ['It stayed in orbit', 'It was thrown away', 'It flew back to the pad', 'It was sold'], a: 1, why: 'Boosters were used once, then dropped, usually into the sea.', tag: 'what used to happen to boosters', re: 'Imagine throwing away an aeroplane after one flight. That was normal for rockets.' },
      { q: 'Why does landing the booster make launches cheaper?', opts: ['It saves fuel', 'The most expensive part gets used again', 'Landing earns prize money', 'The flights are shorter'], a: 1, why: 'The booster is the costliest part of the rocket, so reusing it cuts the price of each flight.', tag: 'why reuse is cheaper', re: 'A taxi ride is affordable because the car is used for thousands of rides. Reuse does that for rockets.' },
    ],
  },
  'Personal finance': {
    title: 'The rule of 72', topic: 'Personal finance', art: 'moneybag',
    cards: [
      simple('The rule of 72', 'Want to know how long money takes to double? Divide 72 by the yearly return.', 'moneybag'),
      simple('Try it', 'At 8% a year, 72 ÷ 8 = 9 years. At 12%, about 6 years. At 4%, about 18.', 'target'),
      simple('A shortcut, not a promise', 'Returns move from year to year, and rising prices eat into what the money buys. Use the rule to compare options, not to predict.', 'scales'),
    ],
    teach: { q: 'What does the rule of 72 tell you? One sentence.', sample: 'Divide 72 by the yearly return to see roughly how many years money takes to double.', add: 'it is a shortcut, and real returns move around' },
    quiz: [
      { q: 'At 8% a year, about how long does money take to double?', opts: ['4 years', '9 years', '18 years', '72 years'], a: 1, why: '72 ÷ 8 = 9 years.', tag: 'doubling time at 8%', re: 'Split 72 into shares of 8 and you get 9 of them. Each share is one year.' },
      { q: 'What is the rule of 72 good for?', opts: ['Predicting exact returns', 'Comparing options quickly', 'Avoiding tax', 'Picking shares'], a: 1, why: 'It is a quick estimate for comparing, not a forecast.', tag: 'what the rule is for', re: 'It is a ruler held up by eye: good enough to see which plank is longer, not to cut by.' },
    ],
  },
};

/** One demo story per interest that has one; the rest are "nothing new today". */
export function demoStories(interests: string[]): { stories: DeckDraft[]; quiet: string[] } {
  const stories: DeckDraft[] = [];
  const quiet: string[] = [];
  for (const i of interests) {
    const s = STORIES[i];
    if (s) stories.push(s);
    else quiet.push(i);
  }
  return { stories, quiet };
}
