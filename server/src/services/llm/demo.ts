// Last-resort answers. Used when DEMO_MODE=true or every provider failed.
// Always labelled as a demo answer, as the spec requires.
import { learnActionLabel, type LearnActionId, type Profile, type Source } from '@lumora/shared';
import { sleep } from '../../utils/async';

export const DEMO_LABEL = '_Demo answer: Lumora is offline from its AI models right now, so this reply is pre-written._';

export interface DemoAnswerInput {
  question: string;
  action?: LearnActionId | null;
  profile?: Profile;
  sources?: Source[];
}

export function demoAnswer({ question, action, profile, sources = [] }: DemoAnswerInput): string {
  const topic = question.trim().replace(/\s+/g, ' ').slice(0, 120) || 'this topic';
  const interest = profile?.interests[0];
  const hook = interest ? ` Since you're into ${interest}, I'd connect it to that wherever I can.` : '';
  const cite = sources.length ? ' [1]' : '';

  const bodies: Record<LearnActionId | 'default', string> = {
    default: `Here's how I'd walk you through **${topic}**.${hook}\n\n1. **The core idea.** Start with the one-sentence version: what problem does it solve, and for whom?${cite}\n2. **How it works.** Break it into two or three moving parts and see how each one affects the others.\n3. **Why it matters.** Look for where it shows up in everyday life, because that's what makes it stick.\n\nWant me to simplify it, go deeper, or quiz you on it?`,
    simplify: `**${topic}, simply put:** imagine explaining it to a friend over coffee. Take away the jargon and you're left with one main idea and one example. Everything else is detail you can add later.`,
    go_deeper: `**Going deeper on ${topic}:** the beginner version skips the trade-offs. The interesting part is *where it breaks*: the edge cases, the competing explanations, and the open questions experts still argue about.${cite}`,
    real_world_example: `**A real-world example of ${topic}:** think of a city bus network. Each part has a clear job, they depend on each other, and when one part fails you can see the effect spread through the whole system.`,
    challenge_me: `**Challenge:** in two sentences, explain ${topic} to someone who has never heard of it. Then name one situation where your explanation would *not* hold. Reply with your answer and I'll give you feedback.`,
    compare_perspectives: `**Two perspectives on ${topic}:**\n\n- **The optimist:** it opens up new possibilities and lowers barriers for more people.\n- **The skeptic:** it brings hidden costs and trade-offs that are easy to overlook.\n\nThe truth usually depends on context. Which side do you lean towards?`,
  };

  const label = action ? `${DEMO_LABEL} (${learnActionLabel(action)})` : DEMO_LABEL;
  return `${label}\n\n${bodies[action ?? 'default']}`;
}

/** Stream text word by word so the demo looks like a real streamed reply. */
export async function* streamText(text: string, delayMs: number, signal?: AbortSignal): AsyncGenerator<string> {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const part of parts) {
    if (signal?.aborted) return;
    if (delayMs > 0) await sleep(delayMs, signal).catch(() => undefined);
    yield part;
  }
}

/** Clickable, honest placeholder sources for demo mode. */
export function demoSources(query: string): Source[] {
  const q = encodeURIComponent(query.slice(0, 100));
  return [
    {
      id: 1,
      title: `Demo source: Wikipedia search for "${query.slice(0, 60)}"`,
      url: `https://en.wikipedia.org/w/index.php?search=${q}`,
      snippet: 'Demo mode is on, so this is a search link rather than a live research result.',
    },
    {
      id: 2,
      title: `Demo source: Google News for "${query.slice(0, 60)}"`,
      url: `https://news.google.com/search?q=${q}`,
      snippet: 'Demo mode is on, so this is a search link rather than a live research result.',
    },
  ];
}
