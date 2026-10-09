// Server-driven onboarding. The server owns the six steps and the step counter;
// the model only phrases the next question. It reads like a conversation but cannot wander.
import {
  ONBOARDING_STEPS,
  type OnboardingMessageRequest,
  type OnboardingResponse,
  type OnboardingState,
  type Profile,
} from '@lumora/shared';
import { User, type UserDoc } from '../../db/models';
import { ONBOARDING_STEP_DEFS, phraseQuestionPrompt } from '../../prompts/onboarding';
import { conflict } from '../../utils/errors';
import { truncate } from '../../utils/async';
import type { LlmService } from '../llm';
import { extractProfile, sanitizeProfile, type OnboardingAnswer } from './extract';

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export function onboardingState(user: UserDoc): OnboardingState {
  return {
    status: user.onboarding?.status ?? 'not_started',
    step: Math.min(user.onboarding?.step ?? 0, TOTAL_STEPS),
    totalSteps: TOTAL_STEPS,
  };
}

export function userProfile(user: UserDoc): Profile {
  return sanitizeProfile(user.profile ? (user.profile as { toObject?: () => unknown }).toObject?.() ?? user.profile : {});
}

function answersOf(user: UserDoc): OnboardingAnswer[] {
  return (user.onboarding?.answers ?? []).map((a) => ({
    key: a.key as OnboardingAnswer['key'],
    question: a.question ?? '',
    answer: a.answer ?? '',
  }));
}

async function phraseQuestion(step: number, known: OnboardingAnswer[], llm: LlmService): Promise<string> {
  const def = ONBOARDING_STEP_DEFS[step]!;
  // The first question is fixed: nothing is known yet and it saves a model call.
  if (step === 0 || !known.some((a) => a.answer.trim())) return def.fallbackQuestion;
  const { text } = await llm.completeText(
    { system: phraseQuestionPrompt(def, known), messages: [{ role: 'user', content: 'Ask the next question.' }], temperature: 0.8, maxOutputTokens: 120 },
    () => def.fallbackQuestion,
  );
  const cleaned = text.replace(/^["'“”\s]+|["'“”\s]+$/g, '').replace(/^Lumora:\s*/i, '');
  return cleaned && cleaned.includes('?') ? truncate(cleaned, 300) : def.fallbackQuestion;
}

/**
 * Save only if nobody advanced onboarding in the meantime (double-tap, two tabs).
 * Returns the updated user or throws 409.
 */
async function saveIfUnchanged(user: UserDoc, update: Record<string, unknown>): Promise<UserDoc> {
  const updated = await User.findOneAndUpdate(
    { _id: user._id, 'onboarding.step': user.onboarding?.step ?? 0, 'onboarding.status': user.onboarding?.status ?? 'not_started' },
    { $set: update },
    { new: true },
  );
  if (!updated) throw conflict('Onboarding changed in another request. Fetch the current question and try again.');
  return updated;
}

function response(user: UserDoc, finished: boolean): OnboardingResponse {
  const state = onboardingState(user);
  const def = ONBOARDING_STEP_DEFS[state.step];
  return {
    onboarding: state,
    question: !finished && def ? { key: def.key, text: user.onboarding?.currentQuestion || def.fallbackQuestion } : null,
    profile: finished ? userProfile(user) : null,
  };
}

async function finish(user: UserDoc, answers: OnboardingAnswer[], llm: LlmService): Promise<UserDoc> {
  const profile = await extractProfile(answers, llm);
  const anyAnswer = answers.some((a) => a.answer.trim());
  return saveIfUnchanged(user, {
    profile,
    'onboarding.status': anyAnswer ? 'completed' : 'skipped',
    'onboarding.step': TOTAL_STEPS,
    'onboarding.answers': answers,
    'onboarding.currentQuestion': '',
  });
}

export async function handleOnboardingMessage(
  user: UserDoc,
  body: OnboardingMessageRequest,
  llm: LlmService,
): Promise<OnboardingResponse> {
  const status = user.onboarding?.status ?? 'not_started';

  if (body.restart) {
    const updated = await saveIfUnchanged(user, {
      'onboarding.status': 'in_progress',
      'onboarding.step': 0,
      'onboarding.answers': [],
      'onboarding.currentQuestion': ONBOARDING_STEP_DEFS[0]!.fallbackQuestion,
    });
    return response(updated, false);
  }

  if (status === 'completed' || status === 'skipped') {
    // Idempotent: a late or repeated request after the end just returns the result.
    return response(user, true);
  }

  if (status === 'not_started') {
    if (body.skip === 'all') return response(await finish(user, [], llm), true);
    // Any message sent before the first question was shown is a greeting, not an answer.
    const updated = await saveIfUnchanged(user, {
      'onboarding.status': 'in_progress',
      'onboarding.step': 0,
      'onboarding.answers': [],
      'onboarding.currentQuestion': ONBOARDING_STEP_DEFS[0]!.fallbackQuestion,
    });
    return response(updated, false);
  }

  // in_progress
  const step = Math.min(user.onboarding?.step ?? 0, TOTAL_STEPS);
  const answers = answersOf(user);
  if (step >= TOTAL_STEPS) return response(await finish(user, answers, llm), true); // repair a half-finished save

  if (body.skip === 'all') return response(await finish(user, answers, llm), true);

  const answer = body.skip === 'question' ? '' : (body.message ?? '').trim();
  if (!answer && body.skip !== 'question') {
    return response(user, false); // no answer: re-send the current question (e.g. after a refresh)
  }

  const def = ONBOARDING_STEP_DEFS[step]!;
  const nextAnswers = [
    ...answers.filter((a) => a.key !== def.key),
    { key: def.key, question: user.onboarding?.currentQuestion || def.fallbackQuestion, answer },
  ];
  const nextStep = step + 1;

  if (nextStep >= TOTAL_STEPS) return response(await finish(user, nextAnswers, llm), true);

  const question = await phraseQuestion(nextStep, nextAnswers, llm);
  const updated = await saveIfUnchanged(user, {
    'onboarding.step': nextStep,
    'onboarding.answers': nextAnswers,
    'onboarding.currentQuestion': question,
  });
  return response(updated, false);
}
