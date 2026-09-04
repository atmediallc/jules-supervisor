"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";
import { defaultLocale, LOCALE_COOKIE, timeZone } from "./config";
import { getMessages } from "./messages";

interface I18nContextValue {
  locale: string;
  setLocale: (locale: "en" | "es") => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Wraps the tree in next-intl's provider using the locale resolved on the
 * server (the root layout reads the NEXT_LOCALE cookie via getLocale()).
 * The locale is passed down as a prop so the client's first render matches
 * the server render — preventing the EN→ES flash and hydration mismatch that
 * a client-side re-resolution in useEffect would cause.
 */
export function LanguageProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const setLocale = useCallback((newLocale: "en" | "es") => {
    document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }, []);

  const ctx = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <I18nContext.Provider value={ctx}>
      <NextIntlClientProvider
        locale={locale}
        timeZone={timeZone}
        now={new Date()}
        messages={getMessages(locale)}
      >
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}
