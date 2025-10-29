"use client";

import { useState } from "react";

import { MainNav, type NavLink } from "@/components/main-nav";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";

interface MobileNavProps {
  primaryLinks: NavLink[];
  secondaryLinks: NavLink[];
}

export function MobileNav({ primaryLinks, secondaryLinks }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 md:hidden"
          aria-label="Toggle navigation"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="px-6 py-4 text-left">
          <SheetTitle className="text-base font-semibold">
            pack-trace
          </SheetTitle>
        </SheetHeader>
        <div className="grid gap-6 px-6 py-4">
          <MainNav
            links={primaryLinks}
            orientation="vertical"
            onNavigate={handleNavigate}
          />
          <Separator />
          <MainNav
            links={secondaryLinks}
            orientation="vertical"
            onNavigate={handleNavigate}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
