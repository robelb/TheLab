import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import de from './de.json'
import en from './en.json'

/**
 * German and English, with German first.
 *
 * The ads run in Germany and the marketing site is German, so a visitor who
 * lands from a campaign should not have to find a language switch before they
 * can read what a box costs. English stays for everyone already using the shop.
 */
export const SUPPORTED_LOCALES = ['de', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'de'

export const LANGUAGE_STORAGE_KEY = 'atelier-lang'

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    // `de-AT` and `de-DE` are both German as far as this shop is concerned.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      // A `?lang=` on the link wins: it is what a campaign puts there on
      // purpose. After that, whatever they last chose, then their browser.
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      // Nothing is written automatically. Left on, the detector caches whatever
      // it guessed — the browser's language, or a `lang` off a link somebody
      // shared — and there is then no way to tell a guess apart from a decision.
      // What is stored here is only ever a decision; `rememberLocale` writes it.
      caches: [],
    },
    interpolation: {
      // React escapes for us; doing it twice mangles apostrophes.
      escapeValue: false,
    },
  })

/** Keeps `<html lang>` honest, which screen readers and Google both read. */
function syncDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language.split('-')[0]
  }
}

syncDocumentLanguage(i18n.language ?? DEFAULT_LOCALE)
i18n.on('languageChanged', syncDocumentLanguage)

/**
 * Record that the visitor picked this language.
 *
 * Separate from `changeLanguage`, which also runs for a language nobody chose —
 * a campaign link's `?lang=`, or a collection's own default. Only what is
 * written here survives to the next visit and outranks those.
 */
export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
  } catch {
    /* Private mode. The choice holds for this page, and no further. */
  }
}

/** Whether the visitor has ever picked a language for themselves. */
export function hasChosenLocale(): boolean {
  try {
    return isLocale(localStorage.getItem(LANGUAGE_STORAGE_KEY))
  } catch {
    return false
  }
}

/** The active language, narrowed to one we actually have words for. */
export function currentLocale(): Locale {
  const base = (i18n.language ?? DEFAULT_LOCALE).split('-')[0]
  return isLocale(base) ? base : DEFAULT_LOCALE
}

export default i18n
