import en from "./locales/en.json";
import es from "./locales/es.json";
import { isValidLocale, type Locale } from "./config";

/**
 * Recursive shape of a translation catalog. JSON message files only ever
 * contain strings and nested objects, so this faithfully models them
 * without any `any` or unsafe traversal.
 */
export type Messages = {
  [K: string]: string | Messages;
};

const catalogs = { en, es } as const satisfies Record<Locale, Messages>;

/** Single source of truth for every locale's messages. */
export type AppMessages = (typeof catalogs)[Locale];

export function getMessages(locale: string): Messages {
  return (isValidLocale(locale) ? catalogs[locale] : catalogs.en) ?? catalogs.en;
}