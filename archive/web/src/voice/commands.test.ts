import { describe, expect, it } from 'vitest';
import { normalize, parseCommand, type ScreenId } from './commands';

const on = (screen: ScreenId, extra = {}) => ({ screen, ...extra });

describe('normalize', () => {
  it.each([
    ['Hey CurioX, can you simplify that please?', 'simplify that'],
    ['  OK so... GO DEEPER! ', 'go deeper'],
    ["Let's get started", 'get started'],
    ['Um, uh, quiz me now', 'quiz me'],
  ])('%j -> %j', (input, out) => expect(normalize(input)).toBe(out));
});

describe('global commands', () => {
  it.each([
    ['help', 'help'],
    ['What can I say?', 'help'],
    ['voice off', 'voiceOff'],
    ['Turn off voice mode', 'voiceOff'],
    ['repeat that', 'repeat'],
    ['say that again please', 'repeat'],
    ['try again', 'retry'],
  ])('%j -> %s on every screen', (text, type) => {
    for (const screen of ['welcome', 'onboarding', 'ready', 'chat', 'profile'] as ScreenId[]) {
      expect(parseCommand(text, on(screen))?.type).toBe(type);
    }
  });
});

describe('welcome', () => {
  it.each(['start', "Let's get started", 'yes', 'begin'])('%j starts onboarding', (t) => expect(parseCommand(t, on('welcome'))).toEqual({ type: 'start' }));
  it.each(['skip', 'just let me explore', 'no thanks'])('%j skips onboarding', (t) => expect(parseCommand(t, on('welcome'))).toEqual({ type: 'skipAll' }));
});

describe('onboarding', () => {
  it('free answers are dictation, not commands', () => {
    expect(parseCommand('Space, cooking and AI', on('onboarding'))).toBeNull();
    expect(parseCommand("I'm a total beginner", on('onboarding'))).toBeNull();
    expect(parseCommand('I want to start a business', on('onboarding'))).toBeNull();
  });
  it.each(['skip', 'skip this question', 'next', 'pass'])('%j skips the question', (t) =>
    expect(parseCommand(t, on('onboarding'))).toEqual({ type: 'skipQuestion' }),
  );
  it.each(["that's all", 'finish', "I'm done"])('%j finishes', (t) => expect(parseCommand(t, on('onboarding'))).toEqual({ type: 'finish' }));
});

describe('ready', () => {
  it.each(['start learning', "let's go", 'continue'])('%j starts learning', (t) => expect(parseCommand(t, on('ready'))?.type).toBe('startLearning'));
  it('start over', () => expect(parseCommand('start over', on('ready'))?.type).toBe('startOver'));
});

describe('chat', () => {
  it.each([
    ['simplify', 'simplify'],
    ['Can you simplify that?', 'simplify'],
    ['explain it like I am five', 'simplify'],
    ['go deeper', 'go_deeper'],
    ['tell me more', 'go_deeper'],
    ['give me an example', 'real_world_example'],
    ['real world example', 'real_world_example'],
    ['challenge me', 'challenge_me'],
    ['compare perspectives', 'compare_perspectives'],
    ['pros and cons', 'compare_perspectives'],
  ])('%j -> action %s', (text, action) => expect(parseCommand(text, on('chat'))).toEqual({ type: 'action', action }));

  it('a question that merely contains a command word is dictation', () => {
    expect(parseCommand('can you simplify the theory of relativity', on('chat'))).toBeNull();
    expect(parseCommand('give me an example of photosynthesis in plants', on('chat'))).toBeNull();
    expect(parseCommand('what is a quiz show', on('chat'))).toBeNull();
    expect(parseCommand('how do I stop procrastinating', on('chat'))).toBeNull();
  });

  it.each([
    ['quiz me', { type: 'quiz' }],
    ['test me', { type: 'quiz' }],
    ['new chat', { type: 'newChat' }],
    ['open my profile', { type: 'openProfile' }],
    ['read the sources', { type: 'readSources' }],
    ['open source 2', { type: 'openSource', n: 2 }],
    ['open source two', { type: 'openSource', n: 2 }],
    ['open the first link', { type: 'openSource', n: 1 }],
    ['topic three', { type: 'pickTopic', n: 3 }],
    ['the second one', { type: 'pickTopic', n: 2 }],
    ['what topics', { type: 'listTopics' }],
    ['stop', { type: 'stop' }],
    ['go back', { type: 'back' }],
  ])('%j -> %j', (text, cmd) => expect(parseCommand(text, on('chat'))).toEqual(cmd));
});

describe('quiz answers', () => {
  const quizOptions = ['Nuclear fusion in the core', 'Burning coal', 'Reflected moonlight', 'Static electricity'];
  const ctx = on('chat', { quizOptions });
  it.each([
    ['A', 0],
    ['b', 1],
    ['option C', 2],
    ['answer d', 3],
    ['bee', 1],
    ['see', 2],
    ['the first one', 0],
    ['the last one', 3],
    ['number 2', 1],
    ['I think it is fusion in the core', 0],
    ['reflected moonlight', 2],
  ])('%j -> option %i', (text, index) => expect(parseCommand(text, ctx)).toEqual({ type: 'quizAnswer', index }));

  it('an unclear answer is not guessed', () => {
    expect(parseCommand('electricity or coal maybe', ctx)).toBeNull();
  });

  it('letters beyond the options are ignored', () => {
    expect(parseCommand('d', on('chat', { quizOptions: ['x', 'y'] }))).toBeNull();
  });

  it('stop the quiz', () => expect(parseCommand('stop the quiz', ctx)).toEqual({ type: 'endQuiz' }));

  it('without an active quiz, letters are dictation', () => expect(parseCommand('b', on('chat'))).toBeNull());
});

describe('profile', () => {
  it.each([
    ['add interest chess', { type: 'profileAdd', field: 'interests', value: 'chess' }],
    ['add a goal pass my exam', { type: 'profileAdd', field: 'goals', value: 'pass my exam' }],
    ['add jazz to my interests', { type: 'profileAdd', field: 'interests', value: 'jazz' }],
    ['my goal is to learn python', { type: 'profileAdd', field: 'goals', value: 'learn python' }],
    ["I'm also interested in astronomy", { type: 'profileAdd', field: 'interests', value: 'astronomy' }],
    ["I'm curious about black holes", { type: 'profileAdd', field: 'curiosities', value: 'black holes' }],
    ['remove interest cooking', { type: 'profileRemove', field: 'interests', value: 'cooking' }],
    ['delete cooking from my interests', { type: 'profileRemove', field: 'interests', value: 'cooking' }],
    ['set tone to playful', { type: 'profileSet', field: 'tone', value: 'playful' }],
    ['my tone should be formal', { type: 'profileSet', field: 'tone', value: 'formal' }],
    ['explain things with analogies', { type: 'profileSet', field: 'explanationStyle', value: 'analogies' }],
    ['read my profile', { type: 'readProfile' }],
    ['what do you know about me', { type: 'readProfile' }],
    ['redo onboarding', { type: 'redoOnboarding' }],
    ['clear everything', { type: 'clearAll' }],
    ['go back', { type: 'back' }],
  ])('%j -> %j', (text, cmd) => expect(parseCommand(text, on('profile'))).toEqual(cmd));

  it('yes/no only mean confirm/cancel while confirming', () => {
    expect(parseCommand('yes', on('profile', { confirming: true }))).toEqual({ type: 'confirm' });
    expect(parseCommand('no', on('profile', { confirming: true }))).toEqual({ type: 'cancel' });
    expect(parseCommand('yes', on('profile'))).toBeNull();
  });
});

describe('error screen', () => {
  it('try again / yes retries', () => {
    expect(parseCommand('try again', on('error'))).toEqual({ type: 'retry' });
    expect(parseCommand('yes', on('error'))).toEqual({ type: 'retry' });
  });
});
