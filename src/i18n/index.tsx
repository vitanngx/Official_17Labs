"use client";

import React from "react";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import fr from "./locales/fr.json";

export type Locale = "en" | "vi" | "fr";

export const LOCALES: Locale[] = ["en", "vi", "fr"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "🇺🇸 EN",
  vi: "🇻🇳 VI",
  fr: "🇫🇷 FR",
};

type Dict = Record<string, string>;
const dictionaries: Record<Locale, Dict> = { en, vi, fr };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

const LOCALE_STORAGE_KEY = "official.locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (saved && LOCALES.includes(saved)) {
        setLocaleState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];

  const t = React.useCallback(
    (key: string, replacements?: Record<string, string | number>) => {
      let value = dict[key] ?? key;
      if (replacements) {
        for (const [token, rep] of Object.entries(replacements)) {
          value = value.replace(`{${token}}`, String(rep));
        }
      }
      return value;
    },
    [dict]
  );

  const ctx = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within I18nProvider");
  }
  return ctx;
}
