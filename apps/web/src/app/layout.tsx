import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import "./globals.css";
import Providers from "../i18n/Providers";

export const metadata: Metadata = {
  title: "Jules Supervisor — AI Orchestration & Governance Control Plane",
  description: "Autonomous policy-controlled supervisor for Google Jules",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
