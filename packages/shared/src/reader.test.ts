import { describe, expect, it } from 'vitest';
import { levelFromWords, profileFromReader, readerFromProfile, tailorQuestions, wonderings } from './reader';
import { toArtKey } from './art';
import { cardSchema } from './zine';

describe('tailorQuestions', () => {
  it('asks about the first interest and offers its own wonderings', () => {
    const [level, goals, style] = tailorQuestions(['Cricket', 'Space']);
    const curious = { options: wonderings(['Cricket', 'Space']), free: true };
    expect(level!.q).toBe('How much do you already know about cricket?');
    expect(level!.options).toContain('I watch every match');
    expect(goals!.options).toContain('Follow matches like a pro');
    expect(goals!.options).toContain('Follow launches and missions');
    expect(style!.options).toContain('Cricket examples');
    // round robin: cricket, space, cricket, space…
    expect(curious!.options.slice(0, 2)).toEqual(['Why does dew matter in night matches?', 'How do rockets land themselves?']);
    expect(curious!.free).toBe(true);
  });

  it('uses short names and falls back for unknown interests', () => {
    expect(tailorQuestions(['Artificial intelligence'])[0]!.q).toBe('How much do you already know about AI?');
    const [level, goals, style] = tailorQuestions(['Pottery']);
    const curious = { options: wonderings(['Pottery']) };
    expect(level!.q).toBe('How much do you already know about pottery?');
    expect(level!.options[2]).toBe('I keep up with it');
    expect(goals!.options.length).toBeGreaterThanOrEqual(4);
    expect(style!.options).toContain('Pottery examples');
    expect(curious!.options.length).toBe(4);
  });

  it('never repeats a chip and keeps at most six goals', () => {
    for (const qs of [tailorQuestions(['Cricket', 'Space', 'Health', 'Music']), tailorQuestions([])]) {
      for (const q of qs) expect(new Set(q.options).size).toBe(q.options.length);
      expect(qs[1]!.options.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('reader card and profile', () => {
  it('derives the prompt profile from the card', () => {
    const p = profileFromReader({
      interests: ['Cricket', 'Space'], level: ['I watch every match'], goals: ['Pure curiosity'],
      style: ['Analogies', 'Cricket examples'], tone: ['Witty'], curious: ['How does DRS actually work?'],
    });
    expect(p.knowledgeLevels).toEqual([{ topic: 'Cricket', level: 'intermediate' }, { topic: 'Space', level: 'intermediate' }]);
    expect(p.explanationStyle).toBe('Analogies, Cricket examples');
    expect(p.tone).toBe('Witty');
    expect(readerFromProfile(p).style).toEqual(['Analogies', 'Cricket examples']);
  });

  it('maps level words', () => {
    expect(levelFromWords('Just curious')).toBe('beginner');
    expect(levelFromWords('I know the basics')).toBe('beginner');
    expect(levelFromWords('I could teach it')).toBe('advanced');
    expect(levelFromWords('I follow every launch')).toBe('intermediate');
    expect(levelFromWords(undefined)).toBe('beginner');
  });

  it('rebuilds a card for an old profile', () => {
    const card = readerFromProfile({ interests: ['chess'], knowledgeLevels: [{ topic: 'chess', level: 'advanced' }], goals: [], explanationStyle: 'short, examples', tone: 'calm', curiosities: [] });
    expect(card).toMatchObject({ interests: ['chess'], level: ['I could teach it'], style: ['short', 'examples'], tone: ['calm'] });
  });
});

describe('art', () => {
  it('accepts keys, emoji and near misses', () => {
    expect(toArtKey('robot')).toBe('robot');
    expect(toArtKey('🤖')).toBe('robot');
    expect(toArtKey('⚖️')).toBe('scales');
    expect(toArtKey('Money Bag')).toBe('moneybag');
    expect(toArtKey('unicorn')).toBe('bulb');
    expect(toArtKey(42, 'star')).toBe('star');
  });

  it('a card with unknown art still validates', () => {
    const c = cardSchema.parse({ kind: 'simple', h: 'Hi', body: 'There', art: 'unicorn' });
    expect(c).toMatchObject({ art: 'bulb', note: '', source: null });
  });
});
