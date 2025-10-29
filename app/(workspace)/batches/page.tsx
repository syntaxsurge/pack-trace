import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, FileText, QrCode, ScanLine } from "lucide-react";

export const dynamic = "force-dynamic";

type FacilitySummary = {
  name: string | null;
  type: string | null;
};

type EventSummary = {
  type: string;
  created_at: string;
  hcs_seq_no: number | null;
};

type BatchRow = {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  created_at: string;
  topic_id: string | null;
  current_owner_facility_id: string | null;
  facilities?: FacilitySummary | FacilitySummary[] | null;
  events?: EventSummary[] | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatQuantity(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en").format(value);
  } catch {
    return value.toString();
  }
}

function resolveFacility(
  raw: FacilitySummary | FacilitySummary[] | null | undefined,
): FacilitySummary | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

function resolveEvent(events: EventSummary[] | null | undefined) {
  if (!events || events.length === 0) return null;
  return events[0];
}

function buildReportUrl(batchId: string, format: "pdf" | "csv") {
  const params = new URLSearchParams({
    batchId,
    format,
  });
  return `/api/report?${params.toString()}`;
}

const quickLinks = [
  {
    href: "/batches/new",
    title: "Create batch",
    description: "Register GTIN, lot, expiry, and quantity, then print labels.",
    icon: QrCode,
  },
  {
    href: "/scan",
    title: "Scan & handover",
    description:
      "Validate GS1 DataMatrix payloads and append custody events.",
    icon: ScanLine,
  },
  {
    href: "/reports",
    title: "Export evidence",
    description: "Generate PDF or CSV traceability certificates per batch.",
    icon: FileText,
  },
] satisfies Array<{
  href: Route;
  title: string;
  description: string;
  icon: LucideIcon;
}>;

export default async function BatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: batches, error } = await supabase
    .from("batches")
    .select(
      `
        id,
        product_name,
        gtin,
        lot,
        expiry,
        qty,
        created_at,
        topic_id,
        current_owner_facility_id,
        facilities:facilities!batches_current_owner_facility_id_fkey ( name, type ),
        events(type, created_at, hcs_seq_no)
      `,
    )
    .order("created_at", { ascending: false })
    .limit(25)
    .order("created_at", {
      foreignTable: "events",
      ascending: false,
    })
    .limit(1, { foreignTable: "events" });

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  const rows = (batches as BatchRow[] | null) ?? [];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Batches
            </h1>
            <p className="text-sm text-muted-foreground">
              View recent batches scoped to your facility, check the latest custody event,
              and jump into timelines or reports.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/batches/new">
              New batch
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing up to 25 most recent batches. Use Reports for full search and exports.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {quickLinks.map(({ href, title, description, icon: Icon }) => (
          <Card key={href} className="shadow-sm transition hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>{description}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={href}>
                  Open
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent batches</CardTitle>
          <CardDescription>
            Latest batches visible under your row-level security policies. Navigate to the timeline for Hedera details.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="rounded border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
              No batches found yet. Create your first batch to generate GS1 DataMatrix labels and publish a MANUFACTURED event.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>GTIN</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Current owner</TableHead>
                  <TableHead>Latest event</TableHead>
                  <TableHead>Seq #</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((batch) => {
                  const facility = resolveFacility(batch.facilities);
                  const latestEvent = resolveEvent(batch.events);

                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {batch.product_name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {batch.gtin}
                      </TableCell>
                      <TableCell className="font-medium">{batch.lot}</TableCell>
                      <TableCell>{formatDate(batch.expiry)}</TableCell>
                      <TableCell>{formatQuantity(batch.qty)}</TableCell>
                      <TableCell>
                        {facility?.name ? (
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {facility.name}
                            </span>
                            {facility.type ? (
                              <span className="text-xs uppercase text-muted-foreground">
                                {facility.type}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          batch.current_owner_facility_id ?? "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {latestEvent ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="w-fit uppercase">
                              {latestEvent.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(latestEvent.created_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {latestEvent?.hcs_seq_no ? (
                          <span className="font-mono text-xs">
                            #{latestEvent.hcs_seq_no}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={{
                                pathname: `/batches/${batch.id}`,
                              }}
                              prefetch={false}
                            >
                              Timeline
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={`/api/batches/${batch.id}/label?format=png`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Label PNG
                            </a>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={buildReportUrl(batch.id, "pdf")}
                              target="_blank"
                              rel="noreferrer"
                            >
                              PDF
                            </a>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={buildReportUrl(batch.id, "csv")}
                              target="_blank"
                              rel="noreferrer"
                            >
                              CSV
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
