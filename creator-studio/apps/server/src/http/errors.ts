import {
  errorEnvelopeSchema,
  PROJECT_REVISION_CONFLICT_CODE,
  projectRevisionConflictDetailsSchema,
  REVISION_CONFLICT_CODE,
  revisionConflictDetailsSchema,
} from '@creator-studio/contracts'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface HttpErrorOptions {
  status: ContentfulStatusCode
  code: string
  message: string
  retryable?: boolean
  details?: unknown
}

export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  readonly retryable: boolean
  readonly details?: unknown

  constructor({ status, code, message, retryable = false, details }: HttpErrorOptions) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.retryable = retryable

    if (details !== undefined) {
      this.details = details
    }
  }
}

export function createProjectRevisionConflictError(currentRevision: number): HttpError {
  return new HttpError({
    status: 409,
    code: PROJECT_REVISION_CONFLICT_CODE,
    message: '项目已在其他位置更新，请刷新后重试。',
    details: projectRevisionConflictDetailsSchema.parse({ currentRevision }),
  })
}

export function createRevisionConflictError(currentRevision: number): HttpError {
  return new HttpError({
    status: 409,
    code: REVISION_CONFLICT_CODE,
    message: '内容已在其他位置更新，请刷新后重试。',
    details: revisionConflictDetailsSchema.parse({ currentRevision }),
  })
}

export function createErrorEnvelope(error: HttpError, requestId: string) {
  const apiError = {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.details === undefined ? {} : { details: error.details }),
  }

  return errorEnvelopeSchema.parse({
    error: apiError,
    meta: { requestId },
  })
}

export function toSafeHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error
  }

  return new HttpError({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: '服务暂时无法处理请求，请使用 request ID 排查。',
  })
}
