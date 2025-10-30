import Link from "next/link";

import { AuthButton } from "@/components/auth-button";
import { MainNav } from "@/components/main-nav";
import type { NavLink } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Separator } from "@/components/ui/separator";
import { Package } from "lucide-react";

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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Enhanced Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-4">
            <MobileNav
              primaryLinks={primaryNav}
              secondaryLinks={secondaryNav}
            />
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg"
              aria-label="pack-trace dashboard home"
            >
              <div className="rounded-lg bg-gradient-to-br from-primary to-accent p-1.5">
                <Package className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="hidden sm:inline">pack-trace</span>
            </Link>
            <Separator orientation="vertical" className="hidden h-6 md:block" />
            <MainNav
              links={primaryNav}
              className="hidden md:flex"
            />
          </div>
          <div className="flex items-center gap-3">
            <MainNav
              links={secondaryNav}
              className="hidden text-sm font-medium md:flex"
              emphasizeActive={false}
            />
            <ThemeSwitcher />
            <Separator orientation="vertical" className="hidden h-6 md:block" />
            <AuthButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-10">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-auto">
        <div className="mx-auto w-full max-w-7xl px-6 py-6">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
            <p>&copy; {new Date().getFullYear()} pack-trace. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="hover:text-primary transition-colors">
                Dashboard
              </Link>
              <Link href="/batches" className="hover:text-primary transition-colors">
                Batches
              </Link>
              <Link href="/reports" className="hover:text-primary transition-colors">
                Reports
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
