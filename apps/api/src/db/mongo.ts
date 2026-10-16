import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectMongo(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
