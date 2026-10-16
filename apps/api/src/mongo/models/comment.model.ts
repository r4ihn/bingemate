import { Schema, model } from 'mongoose';

/**
 * Comment threads, one reply level (review → comment → reply).
 * parentId null = top-level comment; set = a reply to that comment.
 * isOfficial marks the single pinned creator reply on their own title's review.
 */
const commentSchema = new Schema(
  {
    reviewId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    parentId: { type: String, default: null },
    body: { type: String, required: true },
    isOfficial: { type: Boolean, default: false },
  },
  { timestamps: true },
);

commentSchema.index({ reviewId: 1, createdAt: 1 });

export const Comment = model('Comment', commentSchema);
