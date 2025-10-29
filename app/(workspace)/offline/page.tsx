import type { Metadata, Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Offline",
  description:
    "pack-trace caches recent batches, custody events, and verification data for offline continuity.",
};

export const dynamic = "force-static";

const recoverySteps = [
  {
    title: "Continue scanning",
    description:
      "Offline scans still decode GS1 payloads so you can stage custody events until connectivity returns.",
    action: {
      href: "/scan",
      label: "Open scanner",
    },
  },
  {
    title: "Review cached batches",
    description:
      "Dashboard summaries and recent batches remain available from the browser cache.",
    action: {
      href: "/dashboard",
      label: "View dashboard",
    },
  },
  {
    title: "Return to landing",
    description:
      "Marketing site and documentation are cached for reference while you restore connectivity.",
    action: {
      href: "/",
      label: "Go to homepage",
    },
  },
] satisfies Array<{
  title: string;
  description: string;
  action: {
    href: Route;
    label: string;
  };
}>;

export default function Offline() {
  return (
    <div className="space-y-10">
      <header className="space-y-3 text-center sm:text-left">
        <Badge variant="secondary" className="px-3 py-1 uppercase tracking-wide">
          Offline mode
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          You&apos;re offline, but pack-trace keeps working.
        </h1>
        <p className="text-sm text-muted-foreground sm:max-w-2xl">
          Recent packs, custody events, and verification data stay available locally. Once your connection returns, refresh
          to sync Hedera timelines and Supabase updates.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {recoverySteps.map((step) => (
          <Card key={step.title} className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="mt-2 w-full">
                <Link href={step.action.href}>{step.action.label}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
