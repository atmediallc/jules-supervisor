"use client";

import { LanguageProvider } from "./provider";

/** Client boundary that feeds the server-resolved locale into the i18n tree. */
export default function Providers({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return <LanguageProvider locale={locale}>{children}</LanguageProvider>;
}
