// Learn action ids and labels. Each one is an `action` value on POST /api/chat,
// not a separate route. The prompt text for each lives in server/src/prompts/actions.ts.

export const LEARN_ACTIONS = [
  { id: 'simplify', label: 'Simplify' },
  { id: 'go_deeper', label: 'Go deeper' },
  { id: 'real_world_example', label: 'Real-world example' },
  { id: 'challenge_me', label: 'Challenge me' },
  { id: 'compare_perspectives', label: 'Compare perspectives' },
] as const;

export type LearnActionId = (typeof LEARN_ACTIONS)[number]['id'];

export const LEARN_ACTION_IDS = LEARN_ACTIONS.map((a) => a.id) as [LearnActionId, ...LearnActionId[]];

export function learnActionLabel(id: LearnActionId): string {
  return LEARN_ACTIONS.find((a) => a.id === id)?.label ?? id;
}
