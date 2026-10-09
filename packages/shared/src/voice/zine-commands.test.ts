import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseCommand, type ScreenId } from './commands';
import { cardSpeech, deckSpeech } from './cards';

const on = (screen: ScreenId, extra = {}) => ({ screen, ...extra });
const type = (t: string, screen: ScreenId, extra = {}) => parseCommand(t, on(screen, extra))?.type ?? null;

describe('onboarding chips', () => {
  it.each(['next', "that's it", 'continue', 'done'])('%j moves on', (t) => expect(type(t, 'questions')).toBe('next'));
  it.each(['skip', 'skip this one', 'pass', "I don't know"])('%j skips', (t) => expect(type(t, 'questions')).toBe('skipQuestion'));
  it('go back', () => expect(type('go back', 'questions')).toBe('back'));
  it('chip names are dictation', () => {
    expect(parseCommand('cricket and space', on('questions'))).toBeNull();
    expect(parseCommand('just curious', on('questions'))).toBeNull();
  });
});

describe('home', () => {
  it.each(['open', "open today's issue", 'read it', 'yes', "what's new today"])('%j opens today', (t) =>
    expect(['openToday', 'listStories']).toContain(type(t, 'home')),
  );
  it('opens the lead', () => expect(type('open the issue', 'home')).toBe('openToday'));
  it.each([['open story two', 2], ['read the third story', 3], ['story one', 1]])('%j opens a story', (t, n) =>
    expect(parseCommand(t, on('home'))).toEqual({ type: 'openStory', n }),
  );
  it.each(["what's in today's issue", 'read the headlines', 'what else'])('%j lists stories', (t) => expect(type(t, 'home')).toBe('listStories'));
  it.each([
    ['talk', 'openTalk'],
    ["let's talk", 'openTalk'],
    ['open my pinboard', 'openPins'],
    ['ask a question', 'openAsk'],
    ['my reader card', 'openProfile'],
  ])('%j -> %s', (t, cmd) => expect(type(t, 'home')).toBe(cmd));
  it('a question is not a command', () => expect(parseCommand('why do rockets land themselves', on('home'))).toBeNull());
});

describe('deck', () => {
  it.each([
    ['next', 'next'],
    ['keep going', 'next'],
    ['previous card', 'prev'],
    ['read this card', 'readCard'],
    ['play the video', 'play'],
    ['pin it', 'pin'],
    ['quiz me', 'quiz'],
    ['teach it back', 'teachBack'],
    ['read the sources', 'readSources'],
    ['listen', 'listen'],
    ['next story', 'nextStory'],
    ['close the deck', 'close'],
    ['lock it in', 'lockIn'],
    ['go home', 'goHome'],
  ])('%j -> %s', (t, cmd) => expect(type(t, 'deck')).toBe(cmd));

  it.each([
    ['myth', 'myth'],
    ["I think it's a myth", 'myth'],
    ['fact', 'fact'],
    ["it's true", 'fact'],
    ['false', 'myth'],
  ])('%j -> %s', (t, answer) => expect(parseCommand(t, on('deck'))).toEqual({ type: 'myth', answer }));

  it.each([
    ['200', 200],
    ['my guess is 175 billion', 175],
    ['about 1,200', 1200],
    ['I think 3.5 percent', 3.5],
  ])('%j guesses %d', (t, value) => expect(parseCommand(t, on('deck'))).toEqual({ type: 'guess', value }));

  it.each([
    ["like I'm ten", 0],
    ['in cricket', 1],
    ['technical', 2],
    ['the technical one', 2],
  ])('%j picks way %d', (t, n) => expect(parseCommand(t, on('deck'))).toEqual({ type: 'way', n }));

  it('answers the deck quiz when one is waiting', () => {
    expect(parseCommand('B', on('deck', { quizOptions: ['x', 'y', 'z', 'w'] }))).toEqual({ type: 'quizAnswer', index: 1 });
  });
});

describe('quiz', () => {
  const opts = { quizOptions: ['Looking it up', 'Predicting the next word', 'Copying a page', 'Asking another AI'] };
  it.each([
    ['B', 1],
    ['the second one', 1],
    ['predicting the next word', 1],
  ])('%j answers %d', (t, index) => expect(parseCommand(t, on('quiz', opts))).toEqual({ type: 'quizAnswer', index }));
  it('next', () => expect(type('next question', 'quiz')).toBe('next'));
  it('see my score', () => expect(type('see my score', 'quiz')).toBe('next'));
  it('explain that another way', () => expect(type('explain that one another way', 'quiz')).toBe('reexplain'));
  it('close', () => expect(type('exit the quiz', 'quiz')).toBe('close'));
});

describe('talk and pins', () => {
  it.each(['staple it', 'staple this into a deck', 'make it a deck', 'save the talk'])('%j staples', (t) => expect(type(t, 'talk')).toBe('staple'));
  it('start over', () => expect(type('start over', 'talk')).toBe('startOver'));
  it('questions are dictation', () => expect(parseCommand('what makes a small model different', on('talk'))).toBeNull());
  it('read my pins', () => expect(type('read my pins', 'pins')).toBe('readPins'));
  it('open pin two', () => expect(parseCommand('open pin two', on('pins'))).toEqual({ type: 'openPin', n: 2 }));
  it('show as cards in chat', () => expect(type('show as cards', 'chat')).toBe('makeDeck'));
});

describe('help and speech', () => {
  it('every screen has help', () => {
    for (const s of ['questions', 'home', 'deck', 'quiz', 'talk', 'pins'] as ScreenId[]) expect(HELP_TEXT[s].length).toBeGreaterThan(20);
  });
  it('cards read out the way they look', () => {
    expect(cardSpeech({ kind: 'myth', claim: '“AI understands”', answer: 'myth', explain: 'No.', sticker: 'monocle', note: '' })).toBe('Myth or fact? AI understands. Say myth or fact.');
    expect(cardSpeech({ kind: 'guess', question: 'How many?', min: 1, max: 500, answer: 175, unit: 'billion', explain: 'x', art: 'target', sticker: 'thinking' })).toContain('between 1 and 500 billion');
    const s = deckSpeech({ title: 'T', cards: [{ kind: 'simple', h: 'H', body: 'B.', art: 'bulb', note: '', source: null }] });
    expect(s).toBe('T H. B.');
  });
});
