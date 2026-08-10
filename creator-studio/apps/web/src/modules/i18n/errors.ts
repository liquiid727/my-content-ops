import type { TFunction } from 'i18next'

import { ApiClientError } from '../../shared/api'

const errorKeys: Record<string, string> = {
  UNEXPECTED_RESPONSE: 'errors.unexpectedResponse', REQUEST_TIMEOUT: 'errors.requestTimeout', REQUEST_CANCELLED: 'errors.requestCancelled', NETWORK_UNAVAILABLE: 'errors.networkUnavailable',
  VALIDATION_FAILED: 'errors.validationFailed', RESOURCE_NOT_FOUND: 'errors.resourceNotFound', NOT_FOUND: 'errors.resourceNotFound', PROJECT_REVISION_CONFLICT: 'errors.projectConflict', FILE_TOO_LARGE: 'errors.fileTooLarge',
  ASSET_IN_USE: 'errors.assetInUse', IDEMPOTENCY_KEY_REUSED: 'errors.idempotencyReused', TASK_TYPE_UNSUPPORTED: 'errors.taskUnsupported', TASK_ALREADY_FINISHED: 'errors.taskFinished', CONNECTOR_UNAVAILABLE: 'errors.connectorUnavailable',
  TASK_HANDLER_FAILED: 'errors.taskFailed', PROVIDER_UNAVAILABLE: 'errors.providerUnavailable', CONNECTOR_PATH_DENIED: 'errors.connectorPathDenied', SESSION_REQUIRED: 'errors.sessionRequired',
}

export function getLocalizedErrorCodeMessage(code: string, t: TFunction, fallbackKey = 'errors.generic'): string {
  return t(errorKeys[code] ?? fallbackKey)
}

export function getLocalizedErrorMessage(error: unknown, t: TFunction, fallbackKey = 'errors.generic'): string {
  if (error instanceof ApiClientError) return getLocalizedErrorCodeMessage(error.code, t, fallbackKey)
  return t(fallbackKey)
}
