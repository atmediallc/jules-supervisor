import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jules Supervisor — AI Orchestration & Governance Control Plane",
  description: "Autonomous policy-controlled supervisor for Google Jules",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
