import { Schema, model } from 'mongoose';

/**
 * Review body: text only, plus a mediaType copy, with one shape for every media type.
 * _id === PostgreSQL reviews.id (shared id, no FK across stores).
 * A review is a star rating (PostgreSQL) and text (here).
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
  },
  { timestamps: true, _id: false },
);

reviewBodySchema.index({ titleId: 1, createdAt: -1 });

export const ReviewBody = model('ReviewBody', reviewBodySchema);
