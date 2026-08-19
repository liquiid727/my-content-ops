import {
  type Audience,
  type ContentRules,
  type CreatorIdentity,
  type CreatorProfileEntity,
  type CreatorProfilePatch,
  type InjectionSettings,
  type Knowledge,
  type Memory,
  type PersonalStyle,
  type Positioning,
  type SectionKey,
  type Voice,
} from '@creator-studio/contracts'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Switch, Textarea } from '../../shared/ui'

export type CreatorProfileEditorSection = 'summary' | SectionKey | 'injection'

interface CreatorProfileFormProps {
  profile: CreatorProfileEntity
  section: CreatorProfileEditorSection
  saving: boolean
  onCancel: () => void
  onSave: (revision: number, patch: CreatorProfilePatch) => Promise<boolean>
}

function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function splitPipes(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

interface Draft {
  displayName: string
  bio: string
  profile: PersonalStyle
  injection: InjectionSettings
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  )
}

function StringListEditor({ label, value, onChange, placeholder, rows = 3 }: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <Field label={label}>
      <Textarea
        className="font-mono text-xs"
        onChange={(event) => onChange(splitLines(event.target.value))}
        placeholder={placeholder}
        rows={rows}
        value={value.join('\n')}
      />
    </Field>
  )
}

function NicknamesEditor({ value, onChange }: { value: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  const text = Object.entries(value).map(([platform, name]) => `${platform} = ${name}`).join('\n')
  function handle(raw: string) {
    const next: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const index = line.indexOf('=')
      if (index === -1) continue
      const platform = line.slice(0, index).trim()
      const name = line.slice(index + 1).trim()
      if (platform) next[platform] = name
    }
    onChange(next)
  }
  return <Textarea className="font-mono text-xs" onChange={(event) => handle(event.target.value)} rows={3} value={text} />
}

function IdentityEditor({ value, onChange }: { value: CreatorIdentity; onChange: (value: CreatorIdentity) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('profile.fields.creatorName')}>
        <Input onChange={(event) => onChange({ ...value, creatorName: event.target.value })} value={value.creatorName} />
      </Field>
      <Field label={t('profile.fields.nicknames')}>
        <NicknamesEditor onChange={(nicknames) => onChange({ ...value, nicknames })} value={value.nicknames} />
      </Field>
      <Field label={t('profile.fields.currentRole')}>
        <Input onChange={(event) => onChange({ ...value, currentRole: event.target.value })} value={value.currentRole ?? ''} />
      </Field>
      <Field label={t('profile.fields.background')}>
        <Input onChange={(event) => onChange({ ...value, background: event.target.value })} value={value.background ?? ''} />
      </Field>
      <Field label={t('profile.fields.personalStory')}>
        <Input onChange={(event) => onChange({ ...value, personalStory: event.target.value })} value={value.personalStory ?? ''} />
      </Field>
      <Field label={t('profile.fields.mission')}>
        <Input onChange={(event) => onChange({ ...value, mission: event.target.value })} value={value.mission ?? ''} />
      </Field>
    </div>
  )
}

function PositioningEditor({ value, onChange }: { value: Positioning; onChange: (value: Positioning) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('profile.fields.summary')}>
        <Textarea onChange={(event) => onChange({ ...value, summary: event.target.value })} rows={3} value={value.summary} />
      </Field>
      <StringListEditor
        label={t('profile.fields.nicheTags')}
        onChange={(nicheTags) => onChange({ ...value, nicheTags })}
        value={value.nicheTags}
      />
      <Field label={t('profile.fields.differentiation')}>
        <Input onChange={(event) => onChange({ ...value, differentiation: event.target.value })} value={value.differentiation ?? ''} />
      </Field>
      <Field label={t('profile.fields.valueProposition')}>
        <Input onChange={(event) => onChange({ ...value, valueProposition: event.target.value })} value={value.valueProposition ?? ''} />
      </Field>
      <Field label={t('profile.fields.channels')}>
        <Textarea
          className="font-mono text-xs"
          onChange={(event) => {
            const channels = splitPipes(event.target.value)
              .map((line) => {
                const [platform, ...rest] = line.split('|')
                return { platform: (platform ?? '').trim(), focus: rest.join('|').trim() }
              })
              .filter((channel) => channel.platform)
            onChange({ ...value, channels })
          }}
          rows={3}
          value={value.channels.map((channel) => `${channel.platform} | ${channel.focus}`).join('\n')}
        />
      </Field>
    </div>
  )
}

function AudienceEditor({ value, onChange }: { value: Audience; onChange: (value: Audience) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('profile.fields.primaryAudience')}>
        <Input onChange={(event) => onChange({ ...value, primaryAudience: event.target.value })} value={value.primaryAudience} />
      </Field>
      <Field label={t('profile.fields.knowledgeLevel')}>
        <Input onChange={(event) => onChange({ ...value, knowledgeLevel: event.target.value })} value={value.knowledgeLevel ?? ''} />
      </Field>
      <StringListEditor label={t('profile.fields.painPoints')} onChange={(painPoints) => onChange({ ...value, painPoints })} value={value.painPoints} />
      <StringListEditor label={t('profile.fields.goals')} onChange={(goals) => onChange({ ...value, goals })} value={value.goals} />
    </div>
  )
}

function VoiceEditor({ value, onChange }: { value: Voice; onChange: (value: Voice) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StringListEditor label={t('profile.fields.toneLike')} onChange={(like) => onChange({ ...value, tone: { ...value.tone, like } })} value={value.tone.like} />
      <StringListEditor label={t('profile.fields.toneAvoid')} onChange={(avoid) => onChange({ ...value, tone: { ...value.tone, avoid } })} value={value.tone.avoid} />
      <StringListEditor
        label={t('profile.fields.writingStylePreferred')}
        onChange={(preferredAspects) => onChange({ ...value, writingStyle: { ...value.writingStyle, preferredAspects } })}
        value={value.writingStyle.preferredAspects}
      />
      <StringListEditor
        label={t('profile.fields.sentencePatterns')}
        onChange={(sentencePatterns) => onChange({ ...value, writingStyle: { ...value.writingStyle, sentencePatterns } })}
        value={value.writingStyle.sentencePatterns}
      />
      <StringListEditor label={t('profile.fields.vocabularyCommon')} onChange={(common) => onChange({ ...value, vocabulary: { ...value.vocabulary, common } })} value={value.vocabulary.common} />
      <StringListEditor label={t('profile.fields.vocabularyBanned')} onChange={(banned) => onChange({ ...value, vocabulary: { ...value.vocabulary, banned } })} value={value.vocabulary.banned} />
    </div>
  )
}

function KnowledgeEditor({ value, onChange }: { value: Knowledge; onChange: (value: Knowledge) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StringListEditor label={t('profile.fields.domains')} onChange={(domains) => onChange({ ...value, domains })} value={value.domains} />
      <StringListEditor label={t('profile.fields.toolsAndSkills')} onChange={(toolsAndSkills) => onChange({ ...value, toolsAndSkills })} value={value.toolsAndSkills ?? []} />
      <StringListEditor label={t('profile.fields.strengths')} onChange={(strengths) => onChange({ ...value, strengths })} value={value.strengths ?? []} />
    </div>
  )
}

function MemoryEditor({ value, onChange }: { value: Memory; onChange: (value: Memory) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4">
      <Field label={t('profile.fields.pastWorks')}>
        <Textarea
          className="font-mono text-xs"
          onChange={(event) => {
            const pastWorks = splitPipes(event.target.value)
              .map((line) => {
                const [title, platform = '', ...rest] = line.split('|')
                return { title: (title ?? '').trim(), platform: platform.trim() || undefined, reflections: rest.join('|').trim() || undefined }
              })
              .filter((work) => work.title)
            onChange({ ...value, pastWorks })
          }}
          rows={3}
          value={value.pastWorks.map((work) => [work.title, work.platform ?? '', work.reflections ?? ''].join(' | ')).join('\n')}
        />
      </Field>
      <StringListEditor label={t('profile.fields.learnings')} onChange={(learnings) => onChange({ ...value, learnings })} value={value.learnings ?? []} />
    </div>
  )
}

function RulesEditor({ value, onChange }: { value: ContentRules; onChange: (value: ContentRules) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StringListEditor label={t('profile.fields.principles')} onChange={(principles) => onChange({ ...value, principles })} value={value.principles} />
      <StringListEditor label={t('profile.fields.likedStructures')} onChange={(likedStructures) => onChange({ ...value, likedStructures })} value={value.likedStructures ?? []} />
      <StringListEditor label={t('profile.fields.likedHooks')} onChange={(likedHooks) => onChange({ ...value, likedHooks })} value={value.likedHooks ?? []} />
      <StringListEditor label={t('profile.fields.bannedWords')} onChange={(bannedWords) => onChange({ ...value, bannedWords })} value={value.bannedWords ?? []} />
    </div>
  )
}

function InjectionEditor({ value, onChange }: { value: InjectionSettings; onChange: (value: InjectionSettings) => void }) {
  const { t } = useTranslation()
  const sections: Array<{ key: keyof InjectionSettings['sections']; label: string }> = [
    { key: 'identity', label: t('profile.injectionSections.identity') },
    { key: 'positioning', label: t('profile.injectionSections.positioning') },
    { key: 'audience', label: t('profile.injectionSections.audience') },
    { key: 'voice', label: t('profile.injectionSections.voice') },
    { key: 'knowledge', label: t('profile.injectionSections.knowledge') },
    { key: 'memory', label: t('profile.injectionSections.memory') },
    { key: 'rules', label: t('profile.injectionSections.rules') },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-elevated px-4 py-3">
        <span className="text-sm font-semibold">{t('profile.injectionEnabled')}</span>
        <Switch
          aria-label={t('profile.injectionEnabled')}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ key, label }) => (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3" key={key}>
            <span className="text-sm font-medium">{label}</span>
            <Switch
              aria-label={label}
              checked={value.sections[key]}
              disabled={!value.enabled}
              onCheckedChange={(checked) => onChange({ ...value, sections: { ...value.sections, [key]: checked } })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CreatorProfileForm({ profile, section, saving, onCancel, onSave }: CreatorProfileFormProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>({
    displayName: profile.displayName,
    bio: profile.bio,
    profile: profile.profile,
    injection: profile.injection,
  })
  const setProfile = <K extends keyof PersonalStyle>(key: K, value: PersonalStyle[K]) => {
    setDraft((current) => ({ ...current, profile: { ...current.profile, [key]: value } }))
  }

  async function handleSave() {
    let patch: CreatorProfilePatch
    if (section === 'summary') patch = { displayName: draft.displayName, bio: draft.bio }
    else if (section === 'injection') patch = { injection: draft.injection }
    else patch = { profile: draft.profile }

    const saved = await onSave(profile.revision, patch)
    if (saved) onCancel()
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSave() }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7">
        {section === 'summary' ? (
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-display text-xl font-semibold text-primary"
            >
              {draft.displayName.trim().charAt(0) || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('profile.fields.displayName')}>
                  <Input
                    onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                    required
                    value={draft.displayName}
                  />
                </Field>
                <Field label={t('profile.fields.bio')}>
                  <Input onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} value={draft.bio} />
                </Field>
              </div>
            </div>
          </div>
        ) : null}
        {section === 'identity' ? <IdentityEditor onChange={(identity) => setProfile('identity', identity)} value={draft.profile.identity} /> : null}
        {section === 'positioning' ? <PositioningEditor onChange={(positioning) => setProfile('positioning', positioning)} value={draft.profile.positioning} /> : null}
        {section === 'audience' ? <AudienceEditor onChange={(audience) => setProfile('audience', audience)} value={draft.profile.audience} /> : null}
        {section === 'voice' ? <VoiceEditor onChange={(voice) => setProfile('voice', voice)} value={draft.profile.voice} /> : null}
        {section === 'knowledge' ? <KnowledgeEditor onChange={(knowledge) => setProfile('knowledge', knowledge)} value={draft.profile.knowledge} /> : null}
        {section === 'memory' ? <MemoryEditor onChange={(memory) => setProfile('memory', memory)} value={draft.profile.memory} /> : null}
        {section === 'rules' ? <RulesEditor onChange={(rules) => setProfile('rules', rules)} value={draft.profile.rules} /> : null}
        {section === 'injection' ? <InjectionEditor onChange={(injection) => setDraft((current) => ({ ...current, injection }))} value={draft.injection} /> : null}
      </div>

      <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur sm:px-7">
        <Button disabled={saving} onClick={onCancel} type="button" variant="ghost">
          {t('common.cancel')}
        </Button>
        <Button disabled={saving} type="submit" variant="primary">
          {saving ? t('profile.saving') : t('profile.save')}
        </Button>
      </div>
    </form>
  )
}
