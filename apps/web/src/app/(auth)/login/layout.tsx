import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Jules Supervisor",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
