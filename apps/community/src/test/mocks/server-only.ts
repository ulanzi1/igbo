// Mock for `server-only` package in Vitest.
// The real package throws when imported outside a Next.js Server Component.
// This no-op mock allows server-side modules to be imported in unit tests.
export {};
