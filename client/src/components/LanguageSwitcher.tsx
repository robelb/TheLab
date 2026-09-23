import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { rememberLocale, SUPPORTED_LOCALES, type Locale } from '@/i18n'
import { cn } from '@/lib/utils'

const LABEL: Record<Locale, string> = { de: 'DE', en: 'EN' }

/**
 * Two letters, not a dropdown.
 *
 * There are exactly two languages, and a visitor who landed on the wrong one
 * needs to fix it in a single glance — a menu that has to be opened to find out
 * what is in it is worse than showing both.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const active = (i18n.language ?? 'de').split('-')[0]

  async function choose(locale: Locale) {
    if (locale === active) return
    await i18n.changeLanguage(locale)
    // Kept for the next visit, and it outranks a collection's own default.
    rememberLocale(locale)

    // A campaign link carries `?lang=`, and that parameter outranks everything
    // else on the next load — including the choice just made here, which it
    // would overwrite. So a link that names a language has to be corrected when
    // the visitor picks a different one, or switching appears to do nothing the
    // moment they reload or follow a link.
    if (searchParams.get('lang')) {
      const next = new URLSearchParams(searchParams)
      next.set('lang', locale)
      // Replace: choosing a language is not a place in history to go back to.
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <div
      className="flex items-center rounded-brand border border-border/60"
      role="group"
      aria-label={t('common.language')}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => void choose(locale)}
          aria-current={active === locale}
          className={cn(
            'px-2 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
            active === locale
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {LABEL[locale]}
        </button>
      ))}
    </div>
  )
}
