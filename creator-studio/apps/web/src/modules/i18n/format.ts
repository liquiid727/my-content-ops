import type { LocalePreference } from '@creator-studio/contracts'
import type { TFunction } from 'i18next'

const contentTypeKeys: Record<string, string> = {
  general: 'projects.form.general',
  short_video: 'projects.form.shortVideo',
  long_video: 'projects.form.longVideo',
  article: 'projects.form.article',
  podcast: 'projects.form.podcast',
}

export function formatContentType(value: string, t: TFunction): string {
  const key = contentTypeKeys[value]
  return key ? t(key) : value.replaceAll('_', ' ')
}

export function normalizeLocale(language: string): LocalePreference {
  return language.startsWith('en') ? 'en-US' : 'zh-CN'
}

export function formatDateTime(value: string, locale: LocalePreference): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function formatDate(value: string, locale: LocalePreference): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

export function formatNumber(value: number, locale: LocalePreference): string {
  return new Intl.NumberFormat(locale).format(value)
}
