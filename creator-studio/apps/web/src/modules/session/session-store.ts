import { bootstrapResponseSchema, type BootstrapData } from '@creator-studio/contracts'
import { create } from 'zustand'
import { apiRequest, ApiClientError, configureApiSession } from '../../shared/api'

type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SessionState {
  status: SessionStatus
  data: BootstrapData | undefined
  error: ApiClientError | undefined
  requestId: string | undefined
  bootstrap: (force?: boolean) => Promise<void>
  ensureReady: () => Promise<void>
  applyCreatorProfile: (profile: BootstrapData['creatorProfile']) => void
}

let bootstrapRequest: Promise<void> | undefined

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle', data: undefined, error: undefined, requestId: undefined,
  bootstrap: async (force = false) => {
    if (!force && get().status === 'ready') return
    if (!force && bootstrapRequest) return bootstrapRequest
    set({ status: 'loading', error: undefined })
    const run = apiRequest('/bootstrap', bootstrapResponseSchema, { session: false }).then((response) => {
      set({ status: 'ready', data: response.data, requestId: response.meta.requestId, error: undefined })
    }).catch((error: unknown) => {
      const failure = error instanceof ApiClientError ? error : new ApiClientError('Bootstrap 失败。', 'BOOTSTRAP_FAILED', 0, true)
      set({ status: 'error', error: failure, requestId: failure.requestId })
      throw failure
    }).finally(() => { if (bootstrapRequest === run) bootstrapRequest = undefined })
    bootstrapRequest = run
    return run
  },
  ensureReady: async () => {
    if (get().status === 'ready') return
    await get().bootstrap()
  },
  applyCreatorProfile: (creatorProfile) => set((state) => state.data ? { data: { ...state.data, creatorProfile } } : {}),
}))

configureApiSession(() => useSessionStore.getState().ensureReady())

export const sessionSelectors = {
  status: (state: SessionState) => state.status,
  workspace: (state: SessionState) => state.data?.workspace,
  creatorProfile: (state: SessionState) => state.data?.creatorProfile,
  capabilities: (state: SessionState) => state.data?.capabilities,
  error: (state: SessionState) => state.error,
  requestId: (state: SessionState) => state.requestId,
}

export function resetSessionStoreForTests(): void {
  bootstrapRequest = undefined
  useSessionStore.setState({ status: 'idle', data: undefined, error: undefined, requestId: undefined })
  configureApiSession(() => useSessionStore.getState().ensureReady())
}
