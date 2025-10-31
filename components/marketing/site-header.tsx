import Link from "next/link";
import type { Route } from "next";

import { AuthButton } from "@/components/auth-button";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";

interface SiteHeaderProps {
  basePath?: string;
}

const NAV_ITEMS: ReadonlyArray<{ label: string; href: string; absolute?: boolean }> = [
  { label: "Features", href: "#features" },
  { label: "Architecture", href: "#architecture" },
  { label: "Flows", href: "#flows" },
  { label: "Verify", href: "/verify", absolute: true },
] as const;

export function SiteHeader({ basePath = "" }: SiteHeaderProps) {
  const resolveHref = (href: string, absolute?: boolean) => {
    if (absolute) return href;
    if (!href.startsWith("#")) return href;
    return basePath ? `${basePath}${href}` : href;
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg"
          aria-label="pack-trace landing page"
        >
          <BrandLogo size={36} className="h-9 w-9" priority />
          <span className="hidden sm:inline">pack-trace</span>
        </Link>
        <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
          {NAV_ITEMS.map((item) => {
            const href = resolveHref(item.href, item.absolute);
            if (item.absolute) {
              return (
                <Link
                  key={item.label}
                  className="transition-colors hover:text-primary"
                  href={href as Route}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.label}
                className="transition-colors hover:text-primary"
                href={href}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
