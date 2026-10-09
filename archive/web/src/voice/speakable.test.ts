import { describe, expect, it } from 'vitest';
import { chunkForSpeech, speakOptions, toSpeech } from './speakable';

describe('toSpeech', () => {
  it('strips Markdown, citations and links', () => {
    const md = `## How it works\n\n**Rockets** push gas *backwards* [1]. See [NASA](https://nasa.gov) or https://example.com.\n\n- Fuel burns\n- Gas exits [2]\n\n1. First\n2. Second`;
    const out = toSpeech(md);
    expect(out).not.toMatch(/[*#[\]]|https?:/);
    expect(out).toContain('How it works.');
    expect(out).toContain('Rockets push gas backwards.');
    expect(out).toContain('See NASA or a link.');
    expect(out).toContain('Fuel burns. Gas exits.');
  });

  it('announces demo answers in words', () => {
    expect(toSpeech('_Demo answer: offline._\n\nHello')).toBe('This is a demo answer. Hello');
  });

  it('replaces code blocks', () => {
    expect(toSpeech('Try this:\n```js\nconsole.log(1)\n```')).toContain('code example on screen');
  });

  it('cuts long answers at a sentence and points to the screen', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const out = toSpeech(long, 300);
    expect(out.length).toBeLessThan(360);
    expect(out).toMatch(/is here\. The rest is on your screen\.$/);
  });
});

describe('chunkForSpeech', () => {
  it('keeps chunks under the limit and loses no words', () => {
    const text = `${'Short one. '.repeat(30)}${'word '.repeat(120)}end.`;
    const chunks = chunkForSpeech(text, 220);
    expect(chunks.every((c) => c.length <= 221)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.trim().replace(/\s+/g, ' '));
  });

  it('returns one chunk for short text', () => expect(chunkForSpeech('Hello there!')).toEqual(['Hello there!']));
});

it('speakOptions letters each option', () => {
  expect(speakOptions(['Fusion.', 'Coal'])).toBe('A: Fusion. B: Coal.');
});
