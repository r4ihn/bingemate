import type { PrismaClient } from '@prisma/client';
import type mongoose from 'mongoose';

export type Ctx = {
  pg: PrismaClient;
  mongo: mongoose.Connection;
  keepSetup: boolean;
  note(msg: string): void;
};
export interface Scenario {
  name: string;
  description: string;
  defaultRuns?: number;
  defaultWarmup?: number;
  setup?(ctx: Ctx): Promise<void>;
  sql(ctx: Ctx): Promise<void>;
  mongo(ctx: Ctx): Promise<void>;
  app?(ctx: Ctx): Promise<void>;
  teardown?(ctx: Ctx): Promise<void>;
}
