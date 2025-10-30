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
    // Exact match for root
    if (href === "/") {
      return pathname === "/";
    }

    // Check if there's a more specific link that matches
    const hasMoreSpecificMatch = links.some(
      (link) =>
        link.href !== href &&
        link.href.startsWith(href) &&
        (pathname === link.href || pathname.startsWith(`${link.href}/`))
    );

    // If there's a more specific match, this link shouldn't be active
    if (hasMoreSpecificMatch) {
      return false;
    }

    // Otherwise, check for exact match or child route
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
              "text-sm font-semibold transition-all duration-200 relative group",
              orientation === "horizontal"
                ? "hover:text-primary"
                : "rounded-lg px-3 py-2.5 hover:bg-muted",
              active && emphasizeActive
                ? orientation === "horizontal"
                  ? "text-primary"
                  : "bg-primary/10 text-primary font-bold"
                : "text-muted-foreground",
            )}
          >
            {link.label}
            {orientation === "horizontal" && active && emphasizeActive && (
              <span className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
            {orientation === "horizontal" && !active && (
              <span className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-primary rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-200" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
