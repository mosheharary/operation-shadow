import { describe, expect, it } from 'vitest';
import { apiErrorSchema, readinessResponseSchema } from './api';

describe('API contracts', () => {
  it('accepts a well-formed error envelope and rejects unknown codes', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'not_found', message: 'Not found' } }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(false);
  });

  it('caps error messages so internals cannot be dumped into responses', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'internal', message: 'x'.repeat(501) } }).success).toBe(false);
  });

  it('describes readiness with explicit per-check states', () => {
    const ready = { status: 'ready', checks: { database: 'ok', migrations: 'ok' } };
    expect(readinessResponseSchema.parse(ready)).toEqual(ready);
    expect(readinessResponseSchema.safeParse({ status: 'ready', checks: { database: 'ok' } }).success).toBe(false);
  });
});
