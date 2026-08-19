import type { CreatorProfileEntity, SectionKey } from '@creator-studio/contracts'
import {
  ArrowUpRight,
  AudioLines,
  BookOpenText,
  BrainCircuit,
  Compass,
  FileUp,
  Fingerprint,
  History,
  PencilLine,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import type { CreatorProfileEditorSection } from './creator-profile-form'

interface CreatorProfileOverviewProps {
  profile: CreatorProfileEntity
  onEdit: (section: CreatorProfileEditorSection) => void
  onOpenImport: () => void
  onOpenPreview: () => void
}

interface ProfileSectionCard {
  key: SectionKey
  icon: LucideIcon
  preview: string[]
}

function countMeaningfulValues(value: unknown): number {
  if (typeof value === 'string') return value.trim() ? 1 : 0
  if (Array.isArray(value)) return value.reduce((total, item) => total + countMeaningfulValues(item), 0)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((total, item) => total + countMeaningfulValues(item), 0)
  }
  return 0
}

function compact(values: Array<string | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).slice(0, 3)
}

export function CreatorProfileOverview({ profile, onEdit, onOpenImport, onOpenPreview }: CreatorProfileOverviewProps) {
  const { t, i18n } = useTranslation()
  const { identity, positioning, audience, voice, knowledge, memory, rules } = profile.profile
  const enabledSections = Object.values(profile.injection.sections).filter(Boolean).length
  const updatedAt = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(profile.updatedAt))
  const platformNames = Object.entries(identity.nicknames).map(([platform, name]) => `${platform} · ${name}`)

  const sections: ProfileSectionCard[] = [
    {
      key: 'identity',
      icon: Fingerprint,
      preview: compact([identity.creatorName, identity.currentRole, identity.mission, ...platformNames]),
    },
    {
      key: 'positioning',
      icon: Compass,
      preview: compact([positioning.summary, positioning.valueProposition, ...positioning.nicheTags]),
    },
    {
      key: 'audience',
      icon: UsersRound,
      preview: compact([audience.primaryAudience, audience.knowledgeLevel, ...audience.painPoints, ...audience.goals]),
    },
    {
      key: 'voice',
      icon: AudioLines,
      preview: compact([...voice.tone.like, ...voice.writingStyle.preferredAspects, ...voice.vocabulary.common]),
    },
    {
      key: 'knowledge',
      icon: BookOpenText,
      preview: compact([...knowledge.domains, ...(knowledge.toolsAndSkills ?? []), ...(knowledge.strengths ?? [])]),
    },
    {
      key: 'memory',
      icon: History,
      preview: compact([...memory.pastWorks.map((work) => work.title), ...(memory.learnings ?? [])]),
    },
    {
      key: 'rules',
      icon: ScrollText,
      preview: compact([...rules.principles, ...(rules.likedStructures ?? []), ...(rules.bannedWords ?? [])]),
    },
  ]

  return (
    <div className="space-y-7">
      <section className="studio-glass relative overflow-hidden rounded-[1.75rem] border border-border/70 p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-8 font-display text-[8rem] font-semibold leading-none tracking-[-0.08em] text-foreground/[0.025] sm:text-[11rem]">01</div>
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.4rem] border border-primary/20 bg-primary/10 font-display text-3xl font-semibold text-primary shadow-[inset_0_1px_0_hsl(var(--foreground)/.08)]">
              {profile.displayName.trim().charAt(0) || '?'}
              <span aria-hidden="true" className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-surface bg-success" />
            </div>
            <div className="min-w-0 pt-1">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-primary">{t('profile.dossier')}</p>
              <h2 className="mt-2 truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">{profile.displayName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{profile.bio || t('profile.noBio')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {compact([identity.creatorName, identity.currentRole, ...positioning.nicheTags]).map((item) => (
                  <span className="rounded-full border border-border/80 bg-elevated/70 px-3 py-1 text-xs font-medium text-foreground" key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
          <Button className="relative shrink-0" onClick={() => onEdit('summary')} variant="secondary">
            <PencilLine aria-hidden="true" className="h-4 w-4" />
            {t('profile.editSummary')}
          </Button>
        </div>
        <div className="relative mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted">
          <span>{t('profile.updatedAt', { date: updatedAt })}</span>
          <span className="h-1 w-1 rounded-full bg-border" />
          <span>{t('common.revision', { revision: profile.revision })}</span>
          <span className="h-1 w-1 rounded-full bg-border" />
          <span className="inline-flex items-center gap-1.5 text-success"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t('profile.readyForCreation')}</span>
        </div>
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-labelledby="profile-sections-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-muted">{t('profile.profileStructure')}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold" id="profile-sections-title">{t('profile.contentSections')}</h2>
            </div>
            <p className="hidden text-xs text-muted sm:block">{t('profile.clickToEdit')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map(({ key, icon: Icon, preview }, index) => {
              const count = countMeaningfulValues(profile.profile[key])
              return (
                <Button
                  aria-label={t('profile.editSection', { section: t(`profile.${key}`) })}
                  className="group h-auto min-h-44 w-full items-stretch justify-start rounded-2xl p-0 text-left"
                  key={key}
                  onClick={() => onEdit(key)}
                  variant="secondary"
                >
                  <span className="flex w-full flex-col p-5">
                    <span className="flex items-start justify-between gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-primary transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
                        <Icon aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" />
                      </span>
                      <span className="font-mono text-[0.65rem] font-medium tracking-[0.18em] text-muted">{String(index + 1).padStart(2, '0')}</span>
                    </span>
                    <span className="mt-4 flex items-center justify-between gap-3">
                      <span className="font-display text-lg font-semibold text-foreground">{t(`profile.${key}`)}</span>
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </span>
                    <span className="mt-1 text-xs font-normal text-muted">{t('profile.detailsCount', { count })}</span>
                    <span className="mt-3 line-clamp-2 min-h-10 text-sm font-normal leading-5 text-foreground/80">
                      {preview.length > 0 ? preview.join(' · ') : t('profile.sectionEmpty')}
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>
        </section>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><BrainCircuit aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" /></span>
              <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${profile.injection.enabled ? 'bg-success/10 text-success' : 'bg-elevated text-muted'}`}>
                {profile.injection.enabled ? t('profile.active') : t('profile.inactive')}
              </span>
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold">{t('profile.injection')}</h2>
            <p className="mt-1 text-sm leading-5 text-muted">{t('profile.injectionSummary', { count: enabledSections })}</p>
            <Button className="mt-4 w-full justify-between px-0" onClick={() => onEdit('injection')} variant="ghost">
              {t('profile.manageInjection')}<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>

          <Button aria-label={t('profile.preview')} className="group h-auto w-full justify-between rounded-2xl p-5 text-left" onClick={onOpenPreview} variant="secondary">
            <span>
              <span className="block font-display text-base font-semibold text-foreground">{t('profile.preview')}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted">{t('profile.previewEntryDescription')}</span>
            </span>
            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:rotate-12" />
          </Button>

          <Button aria-label={t('profile.importTitle')} className="group h-auto w-full justify-between rounded-2xl p-5 text-left" onClick={onOpenImport} variant="secondary">
            <span>
              <span className="block font-display text-base font-semibold text-foreground">{t('profile.importTitle')}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted">{t('profile.importEntryDescription')}</span>
            </span>
            <FileUp aria-hidden="true" className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5" />
          </Button>
        </aside>
      </div>
    </div>
  )
}
