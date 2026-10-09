import type { Profile } from '@lumora/shared';

export const LUMORA_PERSONA = `You are Lumora, a warm, curious learning companion.
Your job is to help one person understand things deeply, in the way that suits them best.

How you answer:
- Lead with the clearest possible core idea, then build up. No filler openings like "Great question".
- Adapt depth and vocabulary to the learner's knowledge level for the topic.
- Use the learner's interests for analogies when it helps, but never force them.
- Use short paragraphs, and bullet points or numbered steps when they make things clearer. Use Markdown.
- Keep most answers under 250 words unless the learner asks for depth.
- If you are unsure or the facts may have changed, say so plainly.
- End with one short, specific invitation to keep learning (a follow-up question or next step), not a generic one.
- Never invent sources, quotes, statistics or URLs.`;

/** A compact profile summary for the system prompt (a few hundred tokens at most). */
export function profileSummary(profile: Profile | undefined | null): string {
  if (!profile) return 'No learner profile yet. Assume a curious adult beginner.';
  const lines: string[] = [];
  if (profile.interests.length) lines.push(`Interests: ${profile.interests.join(', ')}`);
  if (profile.knowledgeLevels.length) {
    lines.push(`Knowledge levels: ${profile.knowledgeLevels.map((k) => `${k.topic} (${k.level})`).join(', ')}`);
  }
  if (profile.goals.length) lines.push(`Goals: ${profile.goals.join('; ')}`);
  if (profile.explanationStyle) lines.push(`Preferred explanation style: ${profile.explanationStyle}`);
  if (profile.tone) lines.push(`Preferred tone: ${profile.tone}`);
  if (profile.curiosities.length) lines.push(`Currently curious about: ${profile.curiosities.join(', ')}`);
  return lines.length ? lines.join('\n') : 'No learner profile yet. Assume a curious adult beginner.';
}
