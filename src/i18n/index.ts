import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ar } from './locales/ar';
import { en, type TranslationDictionary, type TranslationKey } from './locales/en';
import {
  type AppLanguage,
  DEFAULT_LANGUAGE,
  getLanguageDefinition,
  isSupportedLanguage,
  type LanguageDefinition,
  type LocalizedTextMap,
  SUPPORTED_LANGUAGES,
  type TextDirection,
} from './types';

export {
  type AppLanguage,
  DEFAULT_LANGUAGE,
  getLanguageDefinition,
  isSupportedLanguage,
  type LanguageDefinition,
  type LocalizedTextMap,
  MOD_CONTENT_LOCALES,
  SUPPORTED_LANGUAGES,
  type TextDirection,
} from './types';
export type { TranslationDictionary, TranslationKey } from './locales/en';

export const LANGUAGE_STORAGE_KEY = 'woa_mod_creator_lang_v1';

const LOCALE_BUNDLES: Record<AppLanguage, TranslationDictionary> = {
  en,
  ar,
};

let currentLanguage: AppLanguage = readInitialStoredLanguage();
const languageListeners = new Set<(lang: AppLanguage) => void>();

export function readInitialStoredLanguage(): AppLanguage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isSupportedLanguage(saved)) {
        return saved;
      }
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
  return DEFAULT_LANGUAGE;
}

export function applyDocumentLanguage(lang: AppLanguage): void {
  if (typeof document === 'undefined') return;
  const def = getLanguageDefinition(lang);
  document.documentElement.lang = def.localeTag;
  document.documentElement.dir = def.dir;
  document.documentElement.dataset.uiLang = lang;
  if (document.body) {
    document.body.dir = def.dir;
  }
}

export function getActiveLanguage(): AppLanguage {
  return currentLanguage;
}

export function getActiveDirection(lang: AppLanguage = currentLanguage): TextDirection {
  return getLanguageDefinition(lang).dir;
}

export function setActiveLanguage(lang: AppLanguage): void {
  const normalized: AppLanguage = isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE;
  currentLanguage = normalized;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    }
  } catch {
    // ignore storage errors
  }
  applyDocumentLanguage(normalized);
  languageListeners.forEach((listener) => listener(normalized));
}

export function subscribeLanguage(listener: (lang: AppLanguage) => void): () => void {
  languageListeners.add(listener);
  return () => {
    languageListeners.delete(listener);
  };
}

function interpolate(
  template: string,
  params?: Record<string, string | number | undefined>
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = params[key];
    return val === undefined ? '' : String(val);
  });
}

export function translate(
  lang: AppLanguage,
  key: TranslationKey,
  params?: Record<string, string | number | undefined>
): string {
  const dict = LOCALE_BUNDLES[lang] ?? LOCALE_BUNDLES[DEFAULT_LANGUAGE];
  const raw = dict[key] ?? LOCALE_BUNDLES[DEFAULT_LANGUAGE][key] ?? key;
  return interpolate(raw, params);
}

/**
 * Imperative translation helper safe for both React and core TypeScript modules
 * (modValidator, modBuilder, contentRegistry, ModTestEngine, etc.).
 */
export function t(
  key: TranslationKey,
  params?: Record<string, string | number | undefined>
): string {
  return translate(currentLanguage, key, params);
}

/**
 * Builds a clean multi-locale object `{ en, ar, ... }` for exported `.woamod` payloads
 * without inventing or auto-translating missing locales.
 */
export function buildLocalizedExportMap(
  defaultValue: string,
  translations?: LocalizedTextMap
): LocalizedTextMap | undefined {
  const out: LocalizedTextMap = {};
  const trimmedDefault = defaultValue.trim();
  if (trimmedDefault) {
    out.en = trimmedDefault;
  }
  if (translations) {
    for (const [locale, val] of Object.entries(translations)) {
      const cleaned = typeof val === 'string' ? val.trim() : '';
      if (cleaned) {
        out[locale] = cleaned;
      }
    }
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

/**
 * Normalizes localized maps imported from either `{ en, ar }` JSON payloads or scalar fields.
 */
export function mergeLocalizedField(
  scalarValue: string | undefined,
  localizedMap: LocalizedTextMap | undefined
): { value: string; translations?: LocalizedTextMap } {
  const value = (scalarValue ?? localizedMap?.en ?? '').toString();
  if (!localizedMap || typeof localizedMap !== 'object') {
    return { value };
  }
  const cleaned: LocalizedTextMap = {};
  for (const [k, v] of Object.entries(localizedMap)) {
    if (typeof v === 'string' && v.trim()) {
      cleaned[k] = v;
    }
  }
  if (value.trim() && !cleaned.en) {
    cleaned.en = value;
  }
  return {
    value,
    translations: Object.keys(cleaned).length > 0 ? cleaned : undefined,
  };
}

// Initialize document attributes immediately on module load
applyDocumentLanguage(currentLanguage);

interface I18nContextValue {
  language: AppLanguage;
  dir: TextDirection;
  isRtl: boolean;
  languages: LanguageDefinition[];
  setLanguage: (lang: AppLanguage) => void;
  t: (key: TranslationKey, params?: Record<string, string | number | undefined>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: currentLanguage,
  dir: getActiveDirection(currentLanguage),
  isRtl: getActiveDirection(currentLanguage) === 'rtl',
  languages: SUPPORTED_LANGUAGES,
  setLanguage: setActiveLanguage,
  t,
});

export const I18nProvider: React.FC<{
  initialLanguage?: AppLanguage;
  children: React.ReactNode;
}> = ({ initialLanguage, children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const resolved = initialLanguage && isSupportedLanguage(initialLanguage)
      ? initialLanguage
      : readInitialStoredLanguage();
    currentLanguage = resolved;
    applyDocumentLanguage(resolved);
    return resolved;
  });

  useEffect(() => {
    const unsub = subscribeLanguage((nextLang) => {
      setLanguageState(nextLang);
    });
    return unsub;
  }, []);

  const setLanguage = useCallback((nextLang: AppLanguage) => {
    setActiveLanguage(nextLang);
  }, []);

  const dir = getActiveDirection(language);

  const boundT = useCallback(
    (key: TranslationKey, params?: Record<string, string | number | undefined>) =>
      translate(language, key, params),
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      dir,
      isRtl: dir === 'rtl',
      languages: SUPPORTED_LANGUAGES,
      setLanguage,
      t: boundT,
    }),
    [language, dir, setLanguage, boundT]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
