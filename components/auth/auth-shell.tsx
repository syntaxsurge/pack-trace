import Link from "next/link";

import { cn } from "@/lib/utils";

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
        "flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12",
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link
            href="/"
            className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary"
          >
            pack-trace
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

