import type { RequestLogger } from './logging.js'

export type HttpBindings = {
  Variables: {
    requestId: string
    workspaceId: string
    creatorProfileId: string
    requestStartedAt: number
    requestLogger: RequestLogger
    requestLogged: boolean
  }
}
