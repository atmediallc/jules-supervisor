// Explicit declarations for non-TS side-effect imports used across the app.
// Global CSS should always be imported for side effects; these declarations
// keep type-checking and the editor independent of `.next/types` generation
// timing (Next regenerates `next-env.d.ts` ≥ `.next/types` on build/dev).

declare module "*.css";