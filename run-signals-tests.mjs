/**
 * Lightweight test runner for the signals services.
 * Uses Node.js built-in test runner (stable since Node 20) + tsc-compiled output.
 * Run: node --import ./register-ts.mjs run-signals-tests.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { register } from 'node:module';
import { describe, it, before } from 'node:test';
import { pathToFileURL } from 'node:url';

// Dynamically compile + run the TypeScript services via ts-node ESM loader
// We'll compile to JS first using tsc then import the JS output.

// Since we can't easily do dynamic TS imports, let's test the compiled output.
// Run: npx tsc -p apps/api/tsconfig.spec.json --outDir dist-test --noEmit false first
// Then import from dist-test.

console.log(
  'Use: npx tsc -p apps/api/tsconfig.spec.json then node dist-test test'
);
