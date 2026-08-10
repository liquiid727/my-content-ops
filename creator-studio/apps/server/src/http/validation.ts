import type { z } from 'zod'

import { HttpError } from './errors.js'

export function parseWithSchema<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const result = schema.safeParse(input)

  if (result.success) {
    return result.data
  }

  throw new HttpError({
    status: 400,
    code: 'VALIDATION_FAILED',
    message: '请求内容无效，请检查标注的字段。',
    details: {
      issues: result.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    },
  })
}
