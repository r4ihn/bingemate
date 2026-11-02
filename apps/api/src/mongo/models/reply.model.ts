import { Schema, model } from 'mongoose';

/**
 * Replies under a review: one flat list per review, oldest first, no replies to replies.
 * editedAt is set when the writer changes the text; createdAt never changes.
 */
const replySchema = new Schema(
  {
    reviewId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    body: { type: String, required: true },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

replySchema.index({ reviewId: 1, createdAt: 1 });

export const Reply = model('Reply', replySchema);
