import Link from "next/link";

import { cn } from "@/lib/utils";
import { Package } from "lucide-react";

interface AuthShellProps extends React.ComponentPropsWithoutRef<"div"> {
  title: string;
  description?: string;
}

export function AuthShell({
  title,
  description,
  className,
  children,
  ...props
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-background px-4 py-12 relative overflow-hidden",
        className,
      )}
      {...props}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />

      <div className="relative w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 group"
          >
            <div className="rounded-lg bg-gradient-to-br from-primary to-accent p-2 transition-transform group-hover:scale-110">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">pack-trace</span>
          </Link>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {description ? (
              <p className="text-base text-muted-foreground max-w-sm mx-auto">{description}</p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

