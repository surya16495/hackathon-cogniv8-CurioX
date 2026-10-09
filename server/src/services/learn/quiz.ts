import { LIMITS, quizSchema, type Profile, type Quiz, type QuizResponse } from '@curiox/shared';
import { quizPrompt } from '../../prompts/learn';
import { profileSummary } from '../../prompts/persona';
import type { LlmService } from '../llm';

export interface QuizInput {
  topic: string;
  /** Recent conversation text, so the quiz checks what was actually discussed. */
  context?: string;
  profile?: Profile;
  count?: number;
}

/** Extra checks zod cannot express: distinct options, and trim to the requested count. */
export function normalizeQuiz(quiz: Quiz, count: number): Quiz | null {
  const questions = quiz.questions
    .filter((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length)
    .slice(0, count);
  if (questions.length < LIMITS.quizMin) return null;
  return { topic: quiz.topic, questions };
}

export function demoQuiz(topic: string, count: number): Quiz {
  const t = topic.replace(/[\s?.!]+$/, '').slice(0, 80);
  const bank = [
    {
      question: `What is the best first step when learning about ${t}?`,
      options: ['Memorise every detail', 'Understand the core idea in one sentence', 'Skip to the advanced material', 'Avoid asking questions'],
      answerIndex: 1,
      explanation: 'A clear one-sentence core idea gives every later detail somewhere to attach.',
    },
    {
      question: `Which habit helps you remember ${t} longer?`,
      options: ['Explaining it in your own words', 'Re-reading the same page', 'Studying only once', 'Highlighting everything'],
      answerIndex: 0,
      explanation: 'Explaining in your own words (active recall) beats passive re-reading.',
    },
    {
      question: `You meet a claim about ${t} that surprises you. What should you do?`,
      options: ['Accept it immediately', 'Ignore it', 'Check a reliable source', 'Share it right away'],
      answerIndex: 2,
      explanation: 'Surprising claims deserve a check against a trustworthy source.',
    },
    {
      question: `What shows you really understand ${t}?`,
      options: ['You can recite a definition', 'You can apply it to a new example', 'You have read a lot about it', 'You know its history'],
      answerIndex: 1,
      explanation: 'Applying an idea to a new situation shows understanding, not just recall.',
    },
    {
      question: `How can you go deeper on ${t}?`,
      options: ['Stop once it feels familiar', 'Look for where it breaks or has exceptions', 'Read only summaries', 'Avoid other viewpoints'],
      answerIndex: 1,
      explanation: 'Edge cases and exceptions reveal how an idea really works.',
    },
  ];
  return { topic: `${t} (demo quiz)`, questions: bank.slice(0, count) };
}

export async function generateQuiz(input: QuizInput, llm: LlmService): Promise<QuizResponse> {
  const count = Math.min(LIMITS.quizMax, Math.max(LIMITS.quizMin, input.count ?? 4));
  const userContent = [
    `Topic: ${input.topic}`,
    `Learner:\n${profileSummary(input.profile)}`,
    input.context ? `What was just discussed:\n${input.context}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // Accept 3-5 questions from the model, then trim to `count`.
  const { data, provider } = await llm.completeJson(
    { system: quizPrompt(count), messages: [{ role: 'user', content: userContent }], temperature: 0.5 },
    quizSchema,
    () => demoQuiz(input.topic, count),
  );
  const normalized = normalizeQuiz(data, count);
  if (!normalized) return { ...demoQuiz(input.topic, count), provider: 'demo' };
  return { ...normalized, provider };
}
