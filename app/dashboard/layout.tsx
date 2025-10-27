import Link from "next/link";

import { AuthButton } from "@/components/auth-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/dashboard"
            className="text-base font-semibold tracking-tight sm:text-lg"
            aria-label="pack-trace dashboard home"
          >
            pack-trace
          </Link>
          <nav
            aria-label="Primary"
            className="hidden gap-6 text-sm font-medium md:flex"
          >
            <Link
              href="/dashboard"
              className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            href="/reports"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Reports
          </Link>
        </nav>
        <AuthButton />
      </div>
    </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
