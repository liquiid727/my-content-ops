import { ThemeProvider } from 'next-themes'
import type { PropsWithChildren } from 'react'
import { SessionGate } from '../modules/session'
import '../modules/i18n/i18n'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="creator-studio-theme">
      <SessionGate>{children}</SessionGate>
    </ThemeProvider>
  )
}
