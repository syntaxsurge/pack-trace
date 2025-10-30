import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ArrowRight,
  FileText,
  QrCode,
  ScanLine,
  Package,
  Download,
  Eye,
  Calendar,
  Building2,
  Hash,
  Plus,
  MoreVertical,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

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
        events:events!events_batch_id_fkey(type, created_at, hcs_seq_no)
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
    <div className="space-y-8">
      <PageHeader
        title="Batches"
        description="View recent batches scoped to your facility, check the latest custody event, and jump into timelines or reports."
        icon={Package}
        actions={
          <Button asChild size="lg">
            <Link href="/batches/new">
              <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
              New Batch
            </Link>
          </Button>
        }
      />

      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          Showing up to 25 most recent batches. Use Reports for full search and exports.
        </p>
        <Badge variant="secondary" className="font-mono">
          {rows.length} batch{rows.length !== 1 ? 'es' : ''}
        </Badge>
      </div>

      <section className="grid gap-6 sm:grid-cols-3">
        {quickLinks.map(({ href, title, description, icon: Icon }) => (
          <Card
            key={href}
            className="group relative overflow-hidden border-2 transition-all hover:-translate-y-1 hover:shadow-xl"
          >
            <Link href={href} className="block">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="space-y-1 flex-1">
                  <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {description}
                  </CardDescription>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 p-2.5 group-hover:from-primary/20 group-hover:to-accent/20 transition-all">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </section>

      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Recent Batches</CardTitle>
              <CardDescription>
                Latest batches visible under your row-level security policies
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No batches found"
              description="Create your first batch to generate GS1 DataMatrix labels and publish a MANUFACTURED event."
              action={{
                label: "Create Batch",
                onClick: () => {}
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">GTIN</TableHead>
                  <TableHead className="font-semibold">Lot</TableHead>
                  <TableHead className="font-semibold">Expiry</TableHead>
                  <TableHead className="font-semibold">Quantity</TableHead>
                  <TableHead className="font-semibold">Current Owner</TableHead>
                  <TableHead className="font-semibold">Latest Event</TableHead>
                  <TableHead className="font-semibold">Seq #</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((batch) => {
                  const facility = resolveFacility(batch.facilities);
                  const latestEvent = resolveEvent(batch.events);

                  const eventTypeColors: Record<string, string> = {
                    MANUFACTURED: "bg-success/10 text-success border-success/20",
                    HANDOVER: "bg-info/10 text-info border-info/20",
                    RECEIVED: "bg-primary/10 text-primary border-primary/20",
                    DISPENSED: "bg-accent/10 text-accent border-accent/20",
                  };

                  return (
                    <TableRow key={batch.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="max-w-[200px] truncate font-semibold">
                        {batch.product_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {batch.gtin}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {batch.lot}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(batch.expiry)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 font-semibold">
                          <Package className="h-3 w-3 text-muted-foreground" />
                          {formatQuantity(batch.qty)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {facility?.name ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {facility.name}
                              </span>
                              {facility.type && (
                                <Badge variant="outline" className="w-fit text-xs uppercase mt-1">
                                  {facility.type}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {latestEvent ? (
                          <div className="flex flex-col gap-2">
                            <Badge
                              variant="outline"
                              className={`w-fit uppercase font-semibold ${eventTypeColors[latestEvent.type] || ""}`}
                            >
                              {latestEvent.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(latestEvent.created_at)}
                            </span>
                          </div>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {latestEvent?.hcs_seq_no ? (
                          <Badge variant="outline" className="font-mono">
                            <Hash className="h-3 w-3 mr-1" />
                            {latestEvent.hcs_seq_no}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link
                                href={{
                                  pathname: `/batches/${batch.id}`,
                                }}
                                prefetch={false}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                                View Timeline
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={`/api/batches/${batch.id}/label?format=png`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <QrCode className="h-4 w-4" />
                                Download Label
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <a
                                href={buildReportUrl(batch.id, "pdf")}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <FileText className="h-4 w-4" />
                                Export PDF
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={buildReportUrl(batch.id, "csv")}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Download className="h-4 w-4" />
                                Export CSV
                              </a>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
