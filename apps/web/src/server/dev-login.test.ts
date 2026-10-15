import { describe, expect, it } from 'vitest';
import { assertDevLoginSafe, findDevOperator, isDevLoginEnabled } from './dev-login';

describe('dev login guard', () => {
  it('is enabled only when explicitly allowed in local or test environments', () => {
    expect(isDevLoginEnabled({ APP_ENV: 'local', ALLOW_DEV_LOGIN: 'true' })).toBe(true);
    expect(isDevLoginEnabled({ APP_ENV: 'test', ALLOW_DEV_LOGIN: 'true' })).toBe(true);
    expect(isDevLoginEnabled({ APP_ENV: 'local' })).toBe(false);
    expect(isDevLoginEnabled({ APP_ENV: 'local', ALLOW_DEV_LOGIN: 'false' })).toBe(false);
  });

  it('stays disabled on preview deployments even when the flag is set', () => {
    expect(isDevLoginEnabled({ APP_ENV: 'preview', ALLOW_DEV_LOGIN: 'true', VERCEL_ENV: 'preview' })).toBe(false);
  });

  it('refuses to run when switched on in production', () => {
    expect(() => assertDevLoginSafe({ APP_ENV: 'production', ALLOW_DEV_LOGIN: 'true' })).toThrow(/never be enabled/);
    expect(() => assertDevLoginSafe({ APP_ENV: 'local', VERCEL_ENV: 'production', ALLOW_DEV_LOGIN: 'true' })).toThrow();
    expect(() => isDevLoginEnabled({ APP_ENV: 'production', ALLOW_DEV_LOGIN: 'true' })).toThrow();
  });

  it('is a no-op in production when the flag is off', () => {
    expect(() => assertDevLoginSafe({ APP_ENV: 'production' })).not.toThrow();
    expect(isDevLoginEnabled({ APP_ENV: 'production', VERCEL_ENV: 'production' })).toBe(false);
  });

  it('only knows the seeded test operators', () => {
    expect(findDevOperator('a')?.email).toBe('operator.a@shadow.test');
    expect(findDevOperator('admin')).toBeUndefined();
  });
});
