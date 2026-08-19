import { Construction, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { PlannedModule } from './planned-module'

const pageKeys: Record<string, string> = {
  '/nodes': 'nodes',
  '/inspiration': 'inspiration',
  '/templates': 'templates',
  '/publish': 'publish',
  '/history': 'history',
}

export default function WorkspacePlannedPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const page = pageKeys[pathname] ?? 'nodes'
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-7 flex items-center gap-3 text-primary">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-primary/20 bg-primary/10"><Sparkles aria-hidden="true" className="h-4 w-4" /></span>
        <div><p className="font-utility text-[10px] uppercase tracking-[0.18em] text-muted">HelloAlro / Roadmap</p><h1 className="font-display text-3xl font-semibold tracking-tight">{t(`workspacePlanned.${page}.title`)}</h1></div>
      </div>
      <PlannedModule description={t(`workspacePlanned.${page}.description`)} icon={Construction} name={t(`workspacePlanned.${page}.title`)} phase={t(`workspacePlanned.${page}.phase`)} returnLabel={t('workspacePlanned.returnProjects')} returnTo="/projects" />
    </div>
  )
}
