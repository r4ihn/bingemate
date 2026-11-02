import { Schema, model } from 'mongoose';

/**
 * Review body. _id === PostgreSQL reviews.id (shared id, no FK across stores).
 * No rating here: the rating lives in PostgreSQL.
 *
 * One shape for every media type. Everything that differs by type goes in `details`, so the
 * schema does not need a model per type:
 *  - imported reviews: the dataset's extras (movie review_year, TV review_type and publication_name,
 *    book summary, amazon_id and helpfulness)
 *  - reviews written in the site: what the review form asked for (runtimeMinutes for a movie,
 *    chaptersRead for a book, season and episodes for a TV show). These describe the reviewer's
 *    progress, not the title: title facts (runtime, seasons, publisher) live in PostgreSQL.
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
