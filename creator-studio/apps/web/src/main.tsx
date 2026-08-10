import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { AppProviders } from './app/providers'
import './modules/i18n/i18n'
import './styles/globals.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Creator Studio root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
