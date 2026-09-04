import { timeZone } from "@/i18n/config";

/**
 * Locale is a plain BCP-47 tag. next-intl's getLocale() types it as `string`,
 * and Intl accepts any valid tag, so we type formatters as string to avoid a
 * narrowing cast. Values are validated at the i18n boundary (request.ts).
 */
type LocaleTag = string;

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();

function dateTimeFormatter(locale: LocaleTag): Intl.DateTimeFormat {
  const key = `${locale}:${timeZone}`;
  let f = dateTimeFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateTimeFormatterCache.set(key, f);
  }
  return f;
}

/**
 * Locale-aware long date+time label. Server pages pass the locale resolved
 * from the NEXT_LOCALE cookie; client components resolve it via useI18n() so
 * both render identical output (fixed timeZone prevents SSR/client drift).
 */
export function formatDateTime(locale: LocaleTag, value: string | number | Date): string {
  return dateTimeFormatter(locale).format(new Date(value));
}

/** Locale-aware integer formatting (grouping), e.g. 1.500 in es-ES. */
export function formatNumber(locale: LocaleTag, value: number): string {
  const key = `${locale}:decimal`;
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale);
    numberFormatterCache.set(key, f);
  }
  return f.format(value);
}

/** Locale-aware percent formatting of a 0..1 ratio, e.g. 82% for 0.82. */
export function formatPercent(locale: LocaleTag, value: number): string {
  const key = `${locale}:percent`;
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    });
    numberFormatterCache.set(key, f);
  }
  return f.format(value);
}