/**
 * Dev-only "test operator" sign-in for local Docker and automated tests. Production uses Google
 * sign-in only; this path must be impossible to enable there.
 */
export interface DevLoginEnv {
  APP_ENV: string;
  VERCEL_ENV?: string | undefined;
  ALLOW_DEV_LOGIN?: string | undefined;
}

export const DEV_OPERATORS = [
  { key: 'a', email: 'operator.a@shadow.test', name: 'Test Operator A' },
  { key: 'b', email: 'operator.b@shadow.test', name: 'Test Operator B' },
] as const;

export type DevOperatorKey = (typeof DEV_OPERATORS)[number]['key'];

const isProduction = (env: DevLoginEnv) => env.APP_ENV === 'production' || env.VERCEL_ENV === 'production';

/** Fails closed: refuses to start if dev login is switched on in a production environment. */
export function assertDevLoginSafe(env: DevLoginEnv): void {
  if (env.ALLOW_DEV_LOGIN === 'true' && isProduction(env)) {
    throw new Error('ALLOW_DEV_LOGIN must never be enabled in production');
  }
}

export function isDevLoginEnabled(env: DevLoginEnv): boolean {
  assertDevLoginSafe(env);
  return env.ALLOW_DEV_LOGIN === 'true' && (env.APP_ENV === 'local' || env.APP_ENV === 'test');
}

export function findDevOperator(key: string) {
  return DEV_OPERATORS.find((operator) => operator.key === key);
}
