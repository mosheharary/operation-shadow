import { z } from 'zod';

/** Error envelope returned by every /api/v1 handler. Messages are safe for display. */
export const apiErrorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'rate_limited',
  'internal',
  'service_unavailable',
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().max(500),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('operation-shadow'),
  version: z.string(),
  time: z.iso.datetime(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: z.enum(['ok', 'error']),
    migrations: z.enum(['ok', 'pending', 'error']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
