// Vercel function for every /api/* request. The handler is bundled during the Vercel build
// (`npm run vercel-build`); see apps/api/src/vercel.ts.
export { default } from '../apps/api/dist-vercel/handler.mjs';
