import { Schema, model } from 'mongoose';

/**
 * Review body. _id === PostgreSQL reviews.id (shared id, no FK across stores).
 * No rating here: the rating lives in PostgreSQL.
 *
 * A review is a star rating (PostgreSQL) and text (here), the same for every media type, so there is
 * one shape and no model per type. `details` holds only what the dataset import brought along
 * (movie review_year, TV review_type and publication_name, book summary, amazon_id and
 * helpfulness); the site never writes to it. Title facts (runtime, seasons, publisher) live in
 * PostgreSQL, not here.
 *
 * `mediaType` is a deliberate copy of PostgreSQL titles.mediaType. MongoDB cannot join across
 * stores, so keeping it here lets a pipeline group or filter reviews by media type on its own.
 * PostgreSQL stops a title's type changing while it has a details row, and no endpoint changes a
 * title's type today. If one is added, it must update the bodies of that title too.
 */
const reviewBodySchema = new Schema(
  {
    _id: { type: String, required: true }, // = PG reviews.id
    titleId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    mediaType: { type: String, enum: ['MOVIE', 'BOOK', 'TV_SHOW'], required: true },
    body: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: false },
);

reviewBodySchema.index({ titleId: 1, createdAt: -1 });

export const ReviewBody = model('ReviewBody', reviewBodySchema);
