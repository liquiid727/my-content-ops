import { idempotencyKeySchema } from '@creator-studio/contracts'

import { HttpError } from './errors.js'

export function parseIdempotencyKey(value: string | undefined, required = false): string | undefined {
  if (value === undefined && !required) {
    return undefined
  }

  const result = idempotencyKeySchema.safeParse(value)

  if (!result.success) {
    throw new HttpError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Idempotency-Key 必须是有效的 ULID。',
      details: {
        issues: [
          {
            path: ['headers', 'Idempotency-Key'],
            code: 'invalid_format',
            message: 'Expected an uppercase ULID',
          },
        ],
      },
    })
  }

  return result.data
}

export interface StoredIdempotencyResult<TResult> {
  requestHash: string
  responseStatus: number
  responseBody: TResult
}

export type IdempotencyResolution<TResult> =
  | { kind: 'proceed' }
  | { kind: 'replay'; responseStatus: number; responseBody: TResult }

export function resolveIdempotency<TResult>(
  existing: StoredIdempotencyResult<TResult> | null,
  requestHash: string,
): IdempotencyResolution<TResult> {
  if (existing === null) {
    return { kind: 'proceed' }
  }

  if (existing.requestHash !== requestHash) {
    throw new HttpError({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: '此 Idempotency-Key 已用于不同请求，请生成新的 key。',
    })
  }

  return {
    kind: 'replay',
    responseStatus: existing.responseStatus,
    responseBody: existing.responseBody,
  }
}
