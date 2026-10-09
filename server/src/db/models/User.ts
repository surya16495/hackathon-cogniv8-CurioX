import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { KNOWLEDGE_LEVELS, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '@lumora/shared';

const profileSchema = new Schema(
  {
    interests: { type: [String], default: [] },
    knowledgeLevels: {
      type: [{ _id: false, topic: { type: String, required: true }, level: { type: String, enum: KNOWLEDGE_LEVELS, required: true } }],
      default: [],
    },
    goals: { type: [String], default: [] },
    explanationStyle: { type: String, default: '' },
    tone: { type: String, default: '' },
    curiosities: { type: [String], default: [] },
  },
  { _id: false },
);

const onboardingSchema = new Schema(
  {
    status: { type: String, enum: ONBOARDING_STATUSES, default: 'not_started' },
    step: { type: Number, default: 0, min: 0, max: ONBOARDING_STEPS.length },
    /** The phrased question currently shown, so a page refresh gets the same text without a model call. */
    currentQuestion: { type: String, default: '' },
    answers: {
      type: [{ _id: false, key: { type: String, enum: ONBOARDING_STEPS, required: true }, question: String, answer: String }],
      default: [],
    },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    profile: { type: profileSchema, default: () => ({}) },
    onboarding: { type: onboardingSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type UserShape = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserShape>;
export const User = model('User', userSchema);
