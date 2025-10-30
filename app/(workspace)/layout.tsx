import Link from "next/link";

import { AuthButton } from "@/components/auth-button";
import { MainNav } from "@/components/main-nav";
import type { NavLink } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Separator } from "@/components/ui/separator";

const primaryNav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/batches", label: "Batches" },
  { href: "/batches/new", label: "Create batch" },
  { href: "/scan", label: "Scan" },
  { href: "/reports", label: "Reports" },
] satisfies NavLink[];

const secondaryNav = [{ href: "/offline", label: "Offline guide" }] satisfies NavLink[];

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-3">
            <MobileNav
              primaryLinks={primaryNav}
              secondaryLinks={secondaryNav}
            />
            <Link
              href="/dashboard"
              className="text-base font-semibold tracking-tight sm:text-lg"
              aria-label="pack-trace dashboard home"
            >
              pack-trace
            </Link>
            <MainNav
              links={primaryNav}
              className="hidden md:flex"
            />
          </div>
          <div className="flex items-center gap-2">
            <MainNav
              links={secondaryNav}
              className="hidden text-xs font-medium md:flex"
              emphasizeActive={false}
            />
            <ThemeSwitcher />
            <Separator orientation="vertical" className="hidden h-6 md:block" />
            <AuthButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
