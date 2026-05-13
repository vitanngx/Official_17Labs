"use client";

import { I18nProvider } from "@/i18n";

import { Locale } from "@/i18n";

export default function I18nWrapper({ children, initialLocale }: { children: React.ReactNode, initialLocale?: Locale }) {
  return <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>;
}
