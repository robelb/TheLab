import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n'
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
  const active = (i18n.language ?? 'de').split('-')[0]

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
          onClick={() => void i18n.changeLanguage(locale)}
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
