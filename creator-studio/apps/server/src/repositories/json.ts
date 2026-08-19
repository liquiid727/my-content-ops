import { jsonValueSchema } from '@creator-studio/contracts'

export function validateJsonText(value: string, field: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new TypeError(`${field} must contain valid JSON`, { cause: error })
  }

  jsonValueSchema.parse(parsed)
  return value
}

export function validateOptionalJsonText(value: string | null | undefined, field: string): string | null | undefined {
  return value == null ? value : validateJsonText(value, field)
}

export function validateDefaultedJsonText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : validateJsonText(value, field)
}
