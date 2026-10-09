import type { LearnActionId } from '@lumora/shared';

/** One extra instruction per learn action, added to the chat prompt. */
export const ACTION_INSTRUCTIONS: Record<LearnActionId, string> = {
  simplify:
    'LEARN ACTION: SIMPLIFY. Re-explain the most recent topic as simply as possible: plain words, one everyday analogy, at most 120 words. No jargon unless you define it in the same sentence.',
  go_deeper:
    'LEARN ACTION: GO DEEPER. Take the most recent topic one level further than before: underlying mechanisms, important nuances, trade-offs and common misconceptions. Assume the basics are understood.',
  real_world_example:
    'LEARN ACTION: REAL-WORLD EXAMPLE. Give one concrete, vivid real-world example of the most recent topic, ideally connected to the learner\'s interests, and explain step by step how the idea shows up in it.',
  challenge_me:
    'LEARN ACTION: CHALLENGE ME. Do not explain. Ask the learner one thought-provoking question about the most recent topic that tests real understanding, not recall, pitched slightly above their level. Then stop and wait for their answer.',
  compare_perspectives:
    'LEARN ACTION: COMPARE PERSPECTIVES. Present two to three genuinely different viewpoints, schools of thought or approaches on the most recent topic. For each: the core claim, its strongest argument, and its main weakness. Finish with what the disagreement hinges on.',
};
