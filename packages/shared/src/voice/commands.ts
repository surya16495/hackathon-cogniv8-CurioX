// Turns a spoken phrase into a command for the current screen, or null for free dictation.
// Rule: a command must be the whole utterance (after polite filler is removed), so a question
// that merely contains a command word ("can you simplify relativity?") is sent as a question.
import type { LearnActionId } from '../actions';

export type ScreenId =
  | 'welcome'
  | 'onboarding'
  | 'ready'
  | 'chat'
  | 'profile'
  | 'error'
  // the zine app
  | 'questions'
  | 'home'
  | 'deck'
  | 'quiz'
  | 'talk'
  | 'pins';
export type ListField = 'interests' | 'goals' | 'curiosities';
export type TextField = 'tone' | 'explanationStyle';

export type Command =
  | { type: 'help' }
  | { type: 'voiceOff' }
  | { type: 'stop' }
  | { type: 'repeat' }
  | { type: 'retry' }
  | { type: 'back' }
  | { type: 'start' }
  | { type: 'skipAll' }
  | { type: 'skipQuestion' }
  | { type: 'finish' }
  | { type: 'startLearning' }
  | { type: 'startOver' }
  | { type: 'action'; action: LearnActionId }
  | { type: 'quiz' }
  | { type: 'endQuiz' }
  | { type: 'quizAnswer'; index: number }
  | { type: 'newChat' }
  | { type: 'openProfile' }
  | { type: 'readSources' }
  | { type: 'openSource'; n: number }
  | { type: 'pickTopic'; n: number }
  | { type: 'listTopics' }
  | { type: 'profileAdd'; field: ListField; value: string }
  | { type: 'profileRemove'; field: ListField; value: string }
  | { type: 'profileSet'; field: TextField; value: string }
  | { type: 'readProfile' }
  | { type: 'redoOnboarding' }
  | { type: 'clearAll' }
  | { type: 'confirm' }
  | { type: 'cancel' }
  // the zine app
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'close' }
  | { type: 'goHome' }
  | { type: 'openTalk' }
  | { type: 'openPins' }
  | { type: 'openAsk' }
  | { type: 'openToday' }
  | { type: 'openStory'; n: number }
  | { type: 'listStories' }
  | { type: 'readCard' }
  | { type: 'myth'; answer: 'myth' | 'fact' }
  | { type: 'guess'; value: number }
  | { type: 'lockIn' }
  | { type: 'way'; n: number }
  | { type: 'play' }
  | { type: 'pin' }
  | { type: 'teachBack' }
  | { type: 'listen' }
  | { type: 'nextStory' }
  | { type: 'reexplain' }
  | { type: 'staple' }
  | { type: 'makeDeck' }
  | { type: 'openPin'; n: number }
  | { type: 'readPins' };

export interface ParseContext {
  screen: ScreenId;
  /** Options of the quiz question waiting for an answer, if any. */
  quizOptions?: string[];
  /** A destructive action is waiting for yes/no. */
  confirming?: boolean;
}

const LEADING_FILLER =
  /^(?:hey|hi|hello|ok|okay|so|um+|uh+|well|please|curio ?x|curious|can you|could you|would you|will you|i want to|i'd like to|i would like to|let's|lets|now|and|just)\b\s*/;
const TRAILING_FILLER = /\s*\b(?:please|now|for me|thanks|thank you|then|curio ?x)$/;

export function normalize(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 4; i++) {
    const before = t;
    t = t.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '').trim();
    if (t === before) break;
  }
  return t;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, first: 1, '1st': 1, '1': 1, won: 1,
  two: 2, second: 2, '2nd': 2, '2': 2, to: 2, too: 2,
  three: 3, third: 3, '3rd': 3, '3': 3,
  four: 4, fourth: 4, '4th': 4, '4': 4, for: 4,
  five: 5, fifth: 5, '5th': 5, '5': 5,
  six: 6, sixth: 6, '6th': 6, '6': 6,
};

function numberFrom(word: string | undefined): number | null {
  if (!word) return null;
  return NUMBER_WORDS[word] ?? null;
}

const is = (t: string, re: RegExp) => re.test(t);

// ---------- Global ----------
const HELP = /^(help|what can i (say|do)|commands|voice commands|what are (the|my) options|options)$/;
const VOICE_OFF = /^((turn|switch) off voice( mode)?|(stop|exit|disable|end) voice( mode)?|voice (mode )?off|mute|stop listening)$/;
const STOP = /^(stop|stop it|stop that|cancel|pause|shush|be quiet|quiet|stop talking|enough|hold on|wait)$/;
const REPEAT = /^(repeat|repeat that|repeat it|say (that|it) again|again|come again|what did you say|pardon|sorry)$/;
const RETRY = /^(try again|retry|again please|resend|send (it )?again)$/;
const BACK = /^(go back|back|go home|home|main screen|back to (chat|the chat))$/;

// ---------- Screens ----------
const START = /^(start|get started|lets get started|begin|go|lets go|yes|yeah|yep|sure|ok lets go|start onboarding)$/;
const SKIP_ALL = /^(skip|no|nope|not now|skip it|skip that|skip onboarding|skip (the )?questions|no thanks|just (let me )?explore|explore|let me explore)$/;
const SKIP_QUESTION = /^(skip|skip (this|that|it)( one| question)?|pass|next|next question|skip question)$/;
const FINISH = /^(finish|finish now|im done|i am done|done|thats all|that is all|thats it|end|stop (the )?questions|no more questions)$/;
const START_LEARNING = /^(start|start learning|lets start|lets learn|continue|go|lets go|yes|yeah|ok|sounds good|looks good)$/;
const START_OVER = /^(start over|redo|restart|do it again|again from the start|start again)$/;

const ACTIONS: [RegExp, LearnActionId][] = [
  [/^(simplify|simplify (it|that|this)|simpler|make it (simpler|easier)|explain (it |that )?(simpler|more simply|like (im|i am) (five|5))|eli5|too (hard|complicated))$/, 'simplify'],
  [/^(go deeper|deeper|more detail|more details|tell me more|go into (more )?detail|in depth|dig deeper|deep dive)$/, 'go_deeper'],
  [/^((give me |show me )?(a |an )?(real world |real life |practical )?example|real world example|example please|for example|an example)$/, 'real_world_example'],
  [/^(challenge me|test my understanding|ask me (a question|something)|give me a challenge|challenge)$/, 'challenge_me'],
  [/^(compare( perspectives| viewpoints| views)?|other (perspectives|viewpoints|views)|different (perspectives|viewpoints|views)|both sides|pros and cons)$/, 'compare_perspectives'],
];
const QUIZ = /^(quiz|quiz me|test me|give me a quiz|start (a )?quiz|another quiz|quiz me again)$/;
const END_QUIZ = /^(end|stop|cancel|skip|exit) (the )?quiz$/;
const NEW_CHAT = /^(new chat|new conversation|new topic|start (a )?new (chat|conversation|topic)|clear (the )?chat|something else)$/;
const OPEN_PROFILE = /^((open|show|go to|edit) (my )?profile|my profile|profile|settings|open settings)$/;
const READ_SOURCES = /^((read|list|what are) (me )?(the |your )?sources|sources|where did (you|that) (get that|come from)|which sources)$/;
const OPEN_SOURCE = /^open (the )?(source|link|website|site)( number)? (\w+)$/;
const OPEN_SOURCE_ORDINAL = /^open (the )?(\w+) (source|link)$/;
const PICK_TOPIC = /^((topic|option|number|pick|choose|select)( number)? (\w+)|(the )?(\w+) (one|topic|option))$/;
const LIST_TOPICS = /^((what|which) (topics|suggestions)|suggest (something|a topic|topics)|(read|list|say) (the )?(topics|suggestions)|give me (some )?ideas|ideas|topics)$/;

// ---------- The zine ----------
const GO_HOME = /^(go home|home|go to home|back to home|home screen|main screen|today)$/;
const OPEN_TALK = /^((open |go to |start )?talk( mode)?|lets talk|talk to me|can we talk|conversation mode)$/;
const OPEN_PINS = /^((open |show |go to )?(my |the )?(pinboard|pin board|pins|pinned( stuff| things)?|saved( stuff| things)?))$/;
const OPEN_ASK = /^((open |go to )?(ask|chat)|ask (a question|something|curio ?x)|i (have|got) a question|(i want to |let me )?ask (you )?(a question|something))$/;
const OPEN_YOU = /^((open |show |go to )?(you|my reader card|reader card|my card)|about me)$/;
const OPEN_TODAY = /^(open|read|read it|open it|start|go|lets go|yes|yeah|(open|read|start|show me) (todays |today s |the )?(issue|lead|lead story|deck|cards|story|news)|whats new today|todays issue)$/;
const LIST_STORIES = /^(whats (in|new)( today| todays issue| the issue| in todays issue| in the issue)?|what else|(read|list|tell me) (me )?(the )?(headlines|stories|todays stories|whats in the issue)|headlines|stories)$/;
const OPEN_STORY = /^(?:open|read|show)?\s*(?:the\s+)?(?:story|deck)\s+(?:number\s+)?(\w+)$|^(?:open|read|show)\s+(?:the\s+)?(\w+)\s+(?:story|one|deck)$/;
const NEXT = /^(next|next one|next card|forward|go on|keep going|continue|carry on|swipe|onwards|go ahead|and then|then what|okay next|ok next)$/;
const PREV = /^(previous|previous card|back a card|go back a card|last card|the card before|before that|one back)$/;
const CLOSE = /^(close|close (it|this|the deck|the cards)|exit|im done|i am done|done|thats enough|finished)$/;
const READ_CARD = /^(read (it|this|that)( out)?|read (this|the) card|read the card( out)?|what does it say|read)$/;
const MYTH = /^(?:(?:i think|i say|its|it is|i guess|thats|that is|definitely|probably|answer)\s+)*(?:a\s+)?(myth|fact|true|false|real|fake)$/;
const GUESS = /^(?:(?:my guess is|i guess|i think|i say|i reckon|guess|maybe|about|around|its|it is|probably)\s+)*(?:about |around )?(\d[\d,]*(?:\.\d+)?)(?:\s*(?:k|thousand|million|billion|percent|%|\w+))?$/;
const LOCK_IN = /^(lock (it )?in|lock|final answer|thats my (guess|answer)|submit|im sure)$/;
const WAYS: [RegExp, number][] = [
  [/^((like )?(im|i am) (ten|10|five|5|a kid)|(for|like) a (kid|child)|simple( version| one)?|easy( version| one)?|first( one| way)?)$/, 0],
  [/^((in|with) (cricket|sport|sports|music|space|money|football|my (interest|hobby))|(the )?(middle|second)( one| way)?|analogy)$/, 1],
  [/^((the )?technical( one| version| way)?|nerdy|for (experts|nerds)|third( one| way)?|(the )?last( one| way)?)$/, 2],
];
const PLAY = /^(play|play (it|the video|video)|watch( it| the video)?|start the video)$/;
const PIN = /^(pin|pin (it|this|that|the source|the video)|save (it|this|that)|keep (it|this))$/;
const TEACH = /^(teach (it )?back|let me (explain|teach)( it)?|i want to explain( it)?|teach it back)$/;
const LISTEN = /^(listen|read (it )?(all|aloud|out loud)|read (me )?the (whole )?(deck|story|issue)|read everything)$/;
const NEXT_STORY = /^(next story|another story|next deck|whats next|open the next (one|story))$/;
const NEXT_QUESTION = /^(next|next question|continue|go on|keep going|see (my )?score|whats my score|score)$/;
const REEXPLAIN = /^(explain (that|it|this)( one)? (another|a different) way|another way|explain (that|it) again|i dont get it)$/;
const STAPLE = /^(staple( it| this| that)?( into a deck)?|make (it )?(a |into a )?deck|save (this|it|that) (as|into) (a )?deck|save the talk|keep this talk)$/;
const MAKE_DECK = /^((show|turn|make) (it|this|that) (as|into) cards|show as cards|make (a deck|cards)|cards please)$/;
const OPEN_PIN = /^open (?:the )?(?:pin|pinned( one)?|item)\s+(?:number\s+)?(\w+)$|^open (?:the )?(\w+) (?:pin|one)$/;
const READ_PINS = /^((read|list|whats on|what is on) (me )?(my |the )?(pins|pinboard|pin board)|what did i pin)$/;
const Q_NEXT = /^(next|next question|continue|go on|done|thats it|thats all|thats everything|move on|okay next|ok next|carry on)$/;
const Q_SKIP = /^(skip|skip (this|that|it)( one| question)?|pass|skip question|no idea|i dont know)$/;
const Q_FINISH = /^(finish|finish now|stop (the )?questions|no more questions|skip (the )?rest)$/;

const ZINE = new Set<ScreenId>(['home', 'deck', 'quiz', 'talk', 'pins', 'chat', 'profile']);

const LETTERS: Record<string, number> = { a: 0, ay: 0, eh: 0, b: 1, be: 1, bee: 1, c: 2, see: 2, sea: 2, si: 2, d: 3, dee: 3, de: 3 };
const QUIZ_LETTER = /^(?:(?:option|answer|letter|choice|its|it is|i think|i think its|i choose|i pick|my answer is)\s+)?([a-z]{1,3})$/;
const QUIZ_ORDINAL = /^(?:(?:option|answer|choice|number|its|it is|i think its|my answer is)\s+)?(?:the )?(\w+)(?: one| option| answer| choice)?$/;

// ---------- Profile ----------
const FIELD_WORDS: Record<string, ListField> = {
  interest: 'interests', interests: 'interests', topic: 'interests', hobby: 'interests',
  goal: 'goals', goals: 'goals',
  curiosity: 'curiosities', curiosities: 'curiosities', question: 'curiosities',
};
const PROFILE_ADD = /^(?:add|include|put)\s+(?:an?\s+)?(interest|interests|topic|hobby|goal|goals|curiosity|curiosities|question)\s+(.+)$/;
const PROFILE_ADD_TO = /^add\s+(.+?)\s+to\s+(?:my\s+)?(interests|goals|curiosities)$/;
const PROFILE_REMOVE = /^(?:remove|delete|drop)\s+(?:the\s+)?(interest|topic|hobby|goal|curiosity|question)\s+(.+)$/;
const PROFILE_REMOVE_FROM = /^(?:remove|delete|drop)\s+(.+?)\s+from\s+(?:my\s+)?(interests|goals|curiosities)$/;
const MY_GOAL = /^my goal is (?:to )?(.+)$/;
const IM_INTERESTED = /^im (?:also )?(?:interested in|into) (.+)$/;
const IM_CURIOUS = /^im (?:also )?curious about (.+)$/;
const SET_TONE = /^(?:set|change|make)\s+(?:the\s+|my\s+)?tone\s+(?:to\s+)?(.+)$|^(?:my\s+)?tone\s+(?:is|should be)\s+(.+)$/;
const SET_STYLE = /^(?:set|change)\s+(?:the\s+|my\s+)?(?:explanation\s+)?style\s+(?:to\s+)?(.+)$|^explain (?:things )?(?:with|using|in|by) (.+)$/;
const READ_PROFILE = /^((read|tell me|what is|whats|show) (me )?(my )?profile|what do you know about me|who am i)$/;
const REDO_ONBOARDING = /^(redo (the )?(onboarding|questions|getting to know you)|start onboarding( again)?|ask me (the )?questions again)$/;
const CLEAR_ALL = /^((clear|delete|erase|reset|wipe) (my )?(profile|everything|history|all|data)( and history)?|delete everything|start fresh)$/;
const CONFIRM = /^(yes|yeah|yep|confirm|do it|sure|delete|delete it|yes delete|yes please|go ahead)$/;
const CANCEL = /^(no|nope|cancel|dont|do not|never mind|nevermind|keep it|stop)$/;

function quizAnswer(t: string, options: string[]): number | null {
  const letter = t.match(QUIZ_LETTER)?.[1];
  if (letter && letter in LETTERS && LETTERS[letter]! < options.length) return LETTERS[letter]!;
  const ord = t.match(QUIZ_ORDINAL)?.[1];
  if (ord === 'last') return options.length - 1;
  const n = numberFrom(ord);
  if (n && n <= options.length) return n - 1;

  // Saying the answer itself: pick the option whose words best cover what was said.
  const said = new Set(t.split(' ').filter((w) => w.length > 2));
  if (said.size === 0) return null;
  let best = -1;
  let bestScore = 0;
  let tie = false;
  options.forEach((opt, i) => {
    const words = normalize(opt).split(' ').filter((w) => w.length > 2);
    if (!words.length) return;
    const hit = words.filter((w) => said.has(w)).length / words.length;
    if (hit > bestScore) {
      bestScore = hit;
      best = i;
      tie = false;
    } else if (hit === bestScore && hit > 0) tie = true;
  });
  return bestScore >= 0.6 && !tie ? best : null;
}

export function parseCommand(raw: string, ctx: ParseContext): Command | null {
  const t = normalize(raw);
  if (!t) return null;

  if (ctx.confirming) {
    if (is(t, CONFIRM)) return { type: 'confirm' };
    if (is(t, CANCEL)) return { type: 'cancel' };
  }

  if (is(t, HELP)) return { type: 'help' };
  if (is(t, VOICE_OFF)) return { type: 'voiceOff' };
  if (is(t, REPEAT)) return { type: 'repeat' };
  if (is(t, RETRY)) return { type: 'retry' };

  switch (ctx.screen) {
    case 'welcome':
      if (is(t, START)) return { type: 'start' };
      if (is(t, SKIP_ALL)) return { type: 'skipAll' };
      break;

    case 'onboarding':
      if (is(t, SKIP_QUESTION)) return { type: 'skipQuestion' };
      if (is(t, FINISH)) return { type: 'finish' };
      break;

    case 'ready':
      if (is(t, START_LEARNING)) return { type: 'startLearning' };
      if (is(t, START_OVER)) return { type: 'startOver' };
      break;

    case 'chat': {
      if (ctx.quizOptions?.length) {
        if (is(t, END_QUIZ)) return { type: 'endQuiz' };
        const index = quizAnswer(t, ctx.quizOptions);
        if (index !== null) return { type: 'quizAnswer', index };
      }
      for (const [re, action] of ACTIONS) if (is(t, re)) return { type: 'action', action };
      if (is(t, QUIZ)) return { type: 'quiz' };
      if (is(t, NEW_CHAT)) return { type: 'newChat' };
      if (is(t, OPEN_PROFILE)) return { type: 'openProfile' };
      if (is(t, READ_SOURCES)) return { type: 'readSources' };
      const src = t.match(OPEN_SOURCE)?.[4] ?? t.match(OPEN_SOURCE_ORDINAL)?.[2];
      if (src && numberFrom(src)) return { type: 'openSource', n: numberFrom(src)! };
      if (is(t, LIST_TOPICS)) return { type: 'listTopics' };
      const pick = t.match(PICK_TOPIC);
      const pickN = numberFrom(pick?.[4] ?? pick?.[6]) ?? (pick?.[6] === 'last' ? -1 : null);
      if (pick && pickN) return { type: 'pickTopic', n: pickN };
      break;
    }

    case 'profile': {
      if (is(t, READ_PROFILE)) return { type: 'readProfile' };
      if (is(t, REDO_ONBOARDING)) return { type: 'redoOnboarding' };
      if (is(t, CLEAR_ALL)) return { type: 'clearAll' };
      let m = t.match(PROFILE_ADD);
      if (m) return { type: 'profileAdd', field: FIELD_WORDS[m[1]!]!, value: m[2]! };
      m = t.match(PROFILE_ADD_TO);
      if (m) return { type: 'profileAdd', field: m[2] as ListField, value: m[1]! };
      m = t.match(PROFILE_REMOVE);
      if (m) return { type: 'profileRemove', field: FIELD_WORDS[m[1]!]!, value: m[2]! };
      m = t.match(PROFILE_REMOVE_FROM);
      if (m) return { type: 'profileRemove', field: m[2] as ListField, value: m[1]! };
      m = t.match(MY_GOAL);
      if (m) return { type: 'profileAdd', field: 'goals', value: m[1]! };
      m = t.match(IM_INTERESTED);
      if (m) return { type: 'profileAdd', field: 'interests', value: m[1]! };
      m = t.match(IM_CURIOUS);
      if (m) return { type: 'profileAdd', field: 'curiosities', value: m[1]! };
      m = t.match(SET_TONE);
      if (m) return { type: 'profileSet', field: 'tone', value: (m[1] ?? m[2])! };
      m = t.match(SET_STYLE);
      if (m) return { type: 'profileSet', field: 'explanationStyle', value: (m[1] ?? m[2])! };
      break;
    }

    case 'error':
      if (is(t, START) || is(t, RETRY)) return { type: 'retry' };
      break;

    case 'questions':
      if (is(t, Q_NEXT)) return { type: 'next' };
      if (is(t, Q_SKIP)) return { type: 'skipQuestion' };
      if (is(t, Q_FINISH)) return { type: 'finish' };
      if (is(t, PREV) || t === 'back' || t === 'go back') return { type: 'back' };
      break;

    case 'home': {
      if (is(t, LIST_STORIES)) return { type: 'listStories' };
      const m = t.match(OPEN_STORY);
      const n = numberFrom(m?.[1] ?? m?.[2]);
      if (n) return { type: 'openStory', n };
      if (is(t, OPEN_TODAY)) return { type: 'openToday' };
      break;
    }

    case 'deck': {
      if (ctx.quizOptions?.length) {
        const index = quizAnswer(t, ctx.quizOptions);
        if (index !== null) return { type: 'quizAnswer', index };
      }
      const myth = t.match(MYTH)?.[1];
      if (myth) return { type: 'myth', answer: myth === 'myth' || myth === 'false' || myth === 'fake' ? 'myth' : 'fact' };
      // Numbers keep their "," and "." here: normalize() would split "1,200" and "3.5".
      const guess = raw.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9.,%\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.,]$/, '').match(GUESS)?.[1];
      if (guess) return { type: 'guess', value: Number(guess.replace(/,/g, '')) };
      if (is(t, LOCK_IN)) return { type: 'lockIn' };
      for (const [re, n] of WAYS) if (is(t, re)) return { type: 'way', n };
      if (is(t, NEXT_STORY)) return { type: 'nextStory' };
      if (is(t, NEXT)) return { type: 'next' };
      if (is(t, PREV)) return { type: 'prev' };
      if (is(t, PLAY)) return { type: 'play' };
      if (is(t, PIN)) return { type: 'pin' };
      if (is(t, QUIZ)) return { type: 'quiz' };
      if (is(t, TEACH)) return { type: 'teachBack' };
      if (is(t, READ_SOURCES)) return { type: 'readSources' };
      if (is(t, LISTEN)) return { type: 'listen' };
      if (is(t, READ_CARD)) return { type: 'readCard' };
      if (is(t, CLOSE)) return { type: 'close' };
      break;
    }

    case 'quiz':
      if (ctx.quizOptions?.length) {
        const index = quizAnswer(t, ctx.quizOptions);
        if (index !== null) return { type: 'quizAnswer', index };
      }
      if (is(t, REEXPLAIN)) return { type: 'reexplain' };
      if (is(t, NEXT_QUESTION)) return { type: 'next' };
      if (is(t, CLOSE) || is(t, END_QUIZ)) return { type: 'close' };
      break;

    case 'talk':
      if (is(t, STAPLE)) return { type: 'staple' };
      if (is(t, START_OVER)) return { type: 'startOver' };
      break;

    case 'pins': {
      if (is(t, READ_PINS)) return { type: 'readPins' };
      const m = t.match(OPEN_PIN);
      const n = numberFrom(m?.[1] ?? m?.[2]);
      if (n) return { type: 'openPin', n };
      break;
    }
  }

  // Getting around the zine app, from any of its screens.
  if (ZINE.has(ctx.screen)) {
    if (ctx.screen === 'chat') {
      if (is(t, MAKE_DECK)) return { type: 'makeDeck' };
    }
    if (ctx.screen !== 'home' && is(t, GO_HOME)) return { type: 'goHome' };
    if (ctx.screen !== 'talk' && is(t, OPEN_TALK)) return { type: 'openTalk' };
    if (ctx.screen !== 'pins' && is(t, OPEN_PINS)) return { type: 'openPins' };
    if (ctx.screen !== 'chat' && is(t, OPEN_ASK)) return { type: 'openAsk' };
    if (ctx.screen !== 'profile' && is(t, OPEN_YOU)) return { type: 'openProfile' };
  }

  // Checked last so a screen's own meaning of "stop"/"back"/"skip" wins.
  if (is(t, STOP)) return { type: 'stop' };
  if (is(t, BACK)) return { type: 'back' };
  if (ctx.screen !== 'chat' && is(t, OPEN_PROFILE)) return { type: 'openProfile' };
  return null;
}

/** Spoken help for each screen. */
export const HELP_TEXT: Record<ScreenId, string> = {
  welcome: 'Say "start" to set up your profile with six quick questions, or "skip" to explore right away.',
  onboarding: 'Just say your answer. You can also say "skip" to skip a question, "finish" to stop the questions, or "repeat" to hear the question again.',
  ready: 'Say "start learning" to begin, or "start over" to answer the questions again.',
  chat:
    'Ask me anything. After an answer you can say "simplify", "go deeper", "give me an example", "challenge me", "compare perspectives", or "quiz me". During a quiz, say the letter of your answer. You can also say "read the sources", "new chat", "open profile", "stop", "repeat", or "voice off".',
  profile:
    'You can say things like "add interest chess", "remove interest cooking", "my goal is to pass my exam", "set tone to playful", "read my profile", "redo onboarding", "clear everything", or "go back".',
  error: 'Say "try again" to reconnect.',
  questions: 'Say the options you like, one or a few at a time, or say your own answer. Then say "next". You can also say "skip", "go back", or "repeat" to hear the options again.',
  home: 'Say "open" to read today\'s issue, "what\'s new" to hear the headlines, or "open story two". You can also say "talk", "ask a question", "pinboard", or "my reader card".',
  deck: 'Say "next" or "previous" to turn the cards, and "read it" to hear this one. Answer "myth" or "fact", say a number to guess, or "lock it in". You can also say "play", "pin it", "quiz me", "teach it back", "listen", "next story", or "close".',
  quiz: 'Say the letter or the words of your answer, then "next". After the score, say "explain that another way", or "go home".',
  talk: 'Just ask me anything, out loud. Say "staple it" to keep what we said as a deck, or "start over" to begin again.',
  pins: 'Say "read my pins" to hear what you saved, or "open pin one". You can also say "go home".',
};
