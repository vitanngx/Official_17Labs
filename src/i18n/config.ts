export type Locale = "en" | "vi" | "fr";

export const LOCALES: Locale[] = ["en", "vi", "fr"];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "🇺🇸 EN",
  vi: "🇻🇳 VI",
  fr: "🇫🇷 FR",
};
