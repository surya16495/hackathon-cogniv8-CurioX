import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** One reader's issue for one day: a lead deck and a short deck per interest. */
const issueSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    no: { type: Number, required: true },
    leadId: { type: Types.ObjectId, ref: 'Deck', required: true },
    storyIds: { type: [Types.ObjectId], default: [] },
    quiet: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One issue per reader per day, even if two requests race to make it.
issueSchema.index({ userId: 1, date: 1 }, { unique: true });

export type IssueDoc = HydratedDocument<InferSchemaType<typeof issueSchema>>;
export const IssueModel = model('Issue', issueSchema);
