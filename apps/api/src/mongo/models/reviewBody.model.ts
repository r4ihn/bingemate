import { Schema, model } from 'mongoose';

/**
 * Review body. _id === PostgreSQL reviews.id (shared id, no FK across stores).
 * No rating here — the rating lives in PostgreSQL. Media-specific fields via discriminators.
 */
const reviewBodySchema = new Schema(
  {
    _id: { type: String, required: true }, // = PG reviews.id
    titleId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    body: { type: String, required: true },
    // Media-specific extras from the imported dataset (movie review_year; TV review_type and
    // publication_name; book summary, amazon_id, helpfulness).
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { discriminatorKey: 'mediaType', timestamps: true, _id: false },
);

reviewBodySchema.index({ titleId: 1, createdAt: -1 });

export const ReviewBody = model('ReviewBody', reviewBodySchema);

export const MovieReviewBody = ReviewBody.discriminator(
  'MOVIE',
  new Schema({ runtimeMinutes: Number }),
);

export const BookReviewBody = ReviewBody.discriminator(
  'BOOK',
  new Schema({ chaptersRead: Number }),
);

export const TvShowReviewBody = ReviewBody.discriminator(
  'TV_SHOW',
  new Schema({ season: Number, episodes: Number }),
);
