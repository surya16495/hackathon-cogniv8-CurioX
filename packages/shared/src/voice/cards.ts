// What CurioX says aloud for each card: the same words as on screen, in a speakable order.
import type { Card, Deck } from '../zine';

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The words for one card. Interactive cards ask the question and leave the answer for later. */
export function cardSpeech(card: Card): string {
  switch (card.kind) {
    case 'hook':
      return `${card.title} ${card.lead}`;
    case 'what':
      return `${card.title}. ${card.strips.join(' ')}`;
    case 'why':
      return `${card.title}. ${card.body}`;
    case 'myth':
      return `Myth or fact? ${card.claim.replace(/[“”"]/g, '')}. Say myth or fact.`;
    case 'ways':
      return `${card.question} ${card.ways[0]!.label}: ${card.ways[0]!.text}`;
    case 'vs':
      return `${card.title.replace(/ vs /i, ' versus ')}. ${card.rows.map((r) => `${r.k}: ${card.left.label}, ${r.l}. ${card.right.label}, ${r.r}.`).join(' ')}`;
    case 'guess':
      return `Guess the number. ${card.question} Somewhere between ${n(card.min)} and ${n(card.max)}${card.unit ? ` ${card.unit}` : ''}. Say your guess.`;
    case 'watch':
      return `Watch it: ${card.video.title}. Say play to watch.`;
    case 'simple':
      return `${card.h}. ${card.body}`;
  }
}

/** The whole deck read straight through, for "Listen". */
export function deckSpeech(deck: Pick<Deck, 'title' | 'cards'>): string {
  const parts = deck.cards.map((c) => {
    if (c.kind === 'myth') return `Myth or fact? ${c.claim.replace(/[“”"]/g, '')}. It's a ${c.answer}. ${c.explain}`;
    if (c.kind === 'ways') return `${c.question} ${c.ways.map((w) => `${w.label}: ${w.text}`).join(' ')}`;
    if (c.kind === 'guess') return `${c.question} The answer is ${n(c.answer)}${c.unit ? ` ${c.unit}` : ''}. ${c.explain}`;
    if (c.kind === 'watch') return '';
    return cardSpeech(c);
  });
  return [deck.title, ...parts].filter(Boolean).join(' ');
}
