"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavLink = {
  href: Route;
  label: string;
};

interface MainNavProps {
  links: NavLink[];
  orientation?: "horizontal" | "vertical";
  className?: string;
  onNavigate?: () => void;
  emphasizeActive?: boolean;
}

export function MainNav({
  links,
  orientation = "horizontal",
  className,
  onNavigate,
  emphasizeActive = true,
}: MainNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      className={cn(
        orientation === "horizontal"
          ? "flex items-center gap-6"
          : "flex flex-col gap-2",
        className,
      )}
      aria-label="Site navigation"
    >
      {links.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sm font-medium transition-colors",
              orientation === "horizontal"
                ? "hover:text-foreground"
                : "rounded-md px-2 py-2 hover:bg-muted",
              active && emphasizeActive
                ? orientation === "horizontal"
                  ? "text-foreground"
                  : "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
