export type AppLanguage = 'en' | 'ar';

export type TextDirection = 'ltr' | 'rtl';

export type LocalizedTextMap = Record<string, string>;

export interface LanguageDefinition {
  code: AppLanguage;
  englishName: string;
  nativeName: string;
  dir: TextDirection;
  localeTag: string;
}

/**
 * Central language registry. Additional UI languages (e.g. 'fr', 'es', 'de', 'pt', 'tr')
 * can be registered here alongside a matching locale file under `src/i18n/locales/`.
 */
export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    dir: 'ltr',
    localeTag: 'en-US',
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    localeTag: 'ar',
  },
];

export interface ModLocaleOption {
  code: string;
  englishName: string;
  nativeName: string;
  dir: TextDirection;
}

/**
 * Author-selectable locales for multilingual mod content (names, descriptions,
 * dialogue lines, quest objectives, and interaction prompts).
 */
export const MOD_CONTENT_LOCALES: ModLocaleOption[] = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    dir: 'ltr',
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
  },
];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

export function getLanguageDefinition(lang: AppLanguage): LanguageDefinition {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0]
  );
}
