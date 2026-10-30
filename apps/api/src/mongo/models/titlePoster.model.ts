import { Schema, model } from 'mongoose';

/**
 * The image of one title. _id === the PostgreSQL titles.id, so a title has at most one image and
 * replacing it overwrites. `version` goes into the image URL, so a new upload gets a new URL and
 * browsers never show a stale copy.
 */
const posterSchema = new Schema(
  {
    _id: { type: String, required: true }, // = PG titles.id
    contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    data: { type: Buffer, required: true },
    version: { type: Number, required: true },
  },
  { timestamps: true, _id: false },
);

export const TitlePoster = model('TitlePoster', posterSchema);
