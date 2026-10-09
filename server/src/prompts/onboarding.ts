import type { OnboardingStepKey } from '@curiox/shared';

export interface OnboardingStepDef {
  key: OnboardingStepKey;
  /** What the server needs to learn at this step. The model only phrases it. */
  intent: string;
  /** Used as-is in demo mode, or when the model is unavailable. */
  fallbackQuestion: string;
}

// The server owns these six steps and the order. Onboarding cannot wander.
export const ONBOARDING_STEP_DEFS: OnboardingStepDef[] = [
  {
    key: 'interests',
    intent: 'the subjects, hobbies or fields the learner enjoys or wants to explore',
    fallbackQuestion: "Hi, I'm CurioX! To start, what topics or hobbies are you most interested in right now?",
  },
  {
    key: 'knowledgeLevels',
    intent: 'how much the learner already knows about the interests they mentioned (beginner, intermediate or advanced for each)',
    fallbackQuestion: 'For those topics, how much do you already know? Are you a beginner, somewhere in the middle, or fairly advanced?',
  },
  {
    key: 'goals',
    intent: 'what the learner wants to achieve by learning: career, exams, a project, pure curiosity, and so on',
    fallbackQuestion: 'What are you hoping to get out of learning with me? For example a project, an exam, a career move, or just curiosity.',
  },
  {
    key: 'explanationStyle',
    intent: 'how the learner likes things explained: analogies, step-by-step, visuals described in words, examples first, theory first, short or detailed',
    fallbackQuestion: 'How do you like things explained? For example with analogies, step by step, examples first, or short and to the point.',
  },
  {
    key: 'tone',
    intent: 'the tone the learner prefers from CurioX: casual and playful, friendly, or formal and precise',
    fallbackQuestion: 'What tone works best for you: casual and playful, warm and friendly, or more formal and precise?',
  },
  {
    key: 'curiosities',
    intent: 'specific questions or topics the learner is curious about right now and might want to start with',
    fallbackQuestion: "Last one: is there something specific you've been wondering about lately that we could start with?",
  },
];

export function phraseQuestionPrompt(step: OnboardingStepDef, known: { question: string; answer: string }[]): string {
  const transcript = known.length
    ? known.map((k) => `CurioX: ${k.question}\nLearner: ${k.answer || '(skipped)'}`).join('\n')
    : '(no answers yet)';
  return `You are CurioX, a friendly learning companion, getting to know a new learner.
Conversation so far:
${transcript}

Write the NEXT question. It must find out: ${step.intent}.
Rules: one or two short sentences, max 40 words. Optionally react briefly to their last answer first.
Ask exactly one question. Do not ask about anything else. Reply with the question text only, no quotes.`;
}

export const PROFILE_EXTRACTION_PROMPT = `Extract a learner profile from this onboarding conversation.
Reply with JSON only, exactly this shape:
{
  "interests": string[],            // short topic names, e.g. "astronomy"
  "knowledgeLevels": [{"topic": string, "level": "beginner" | "intermediate" | "advanced"}],
  "goals": string[],
  "explanationStyle": string,       // one short phrase, e.g. "analogies, step by step"
  "tone": string,                   // one short phrase, e.g. "casual and playful"
  "curiosities": string[]           // specific questions or topics to explore
}
Use only what the learner said. Use [] or "" for anything they skipped or did not say.
Keep every string under 100 characters. Use at most 10 items per list.`;
