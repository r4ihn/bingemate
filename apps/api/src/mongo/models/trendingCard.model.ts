import { Schema, model } from 'mongoose';

/** Denormalised trending card, rebuilt by jobs/refreshTrending.ts. */
const trendingCardSchema = new Schema(
  {
    titleId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    mediaType: { type: String, required: true },
    avgRating: { type: Number, required: true },
    reviewCount: { type: Number, required: true },
    recentReviews: { type: Number, default: 0 },
    posterUrl: { type: String },
    score: { type: Number, required: true, index: true },
  },
  { timestamps: true },
);

trendingCardSchema.index({ recentReviews: -1 });

export const TrendingCard = model('TrendingCard', trendingCardSchema);
