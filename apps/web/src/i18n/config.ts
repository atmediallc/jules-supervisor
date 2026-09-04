export const defaultLocale = "en" as const;
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

/** Validated cookie that persists the operator's locale choice. */
export const LOCALE_COOKIE = "NEXT_LOCALE" as const;

/**
 * Time zone applied to every locale-aware date/time/number format.
 * Fixed so server-rendered markup never differs from client-rendered
 * markup due to environment differences (previously tripped next-intl's
 * ENVIRONMENT_FALLBACK guard).
 */
export const timeZone = "UTC" as const;

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
