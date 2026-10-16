import { Schema, model } from 'mongoose';

/** Denormalised trending card, rebuilt by jobs/refreshTrending.ts. */
const trendingCardSchema = new Schema(
  {
    titleId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    mediaType: { type: String, required: true },
    avgRating: { type: Number, required: true },
    reviewCount: { type: Number, required: true },
    posterUrl: { type: String },
    score: { type: Number, required: true, index: true },
  },
  { timestamps: true },
);

export const TrendingCard = model('TrendingCard', trendingCardSchema);
