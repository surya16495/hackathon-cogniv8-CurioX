import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const conversationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New conversation', maxlength: 120 },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export type ConversationDoc = HydratedDocument<InferSchemaType<typeof conversationSchema>>;
export const Conversation = model('Conversation', conversationSchema);
