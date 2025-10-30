"use client";

import Link from "next/link";
import { User2, LayoutDashboard, ScanLine, FileText, LogOut } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  email: string;
}

export function UserMenu({ email }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 px-3 font-medium"
        >
          <User2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden max-w-[140px] truncate sm:inline">
            {email}
          </span>
          <span className="sm:hidden">Account</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-xs uppercase text-muted-foreground">
            Signed in as
          </span>
          <span className="truncate font-medium">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/scan" className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Scan workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <LogoutButton
            variant="ghost"
            size="sm"
            className="w-full justify-start px-0 font-medium flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </LogoutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
