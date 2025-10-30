import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FileText, Search, Download, Package, Hash, Calendar, Building2, MoreVertical, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<{
    q?: string | string[];
  }>;
}

interface BatchRow {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  created_at: string;
  current_owner_facility_id: string | null;
  facilities?: {
    name: string | null;
    type: string | null;
  } | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en").format(value);
  } catch {
    return value.toString();
  }
}

function resolveOwner(batch: BatchRow): string {
  if (batch.facilities?.name) {
    const type = batch.facilities.type ? ` (${batch.facilities.type})` : "";
    return `${batch.facilities.name}${type}`;
  }
  return batch.current_owner_facility_id ?? "—";
}

function buildReportUrl(batchId: string, format: "pdf" | "csv"): string {
  return `/api/report?batchId=${encodeURIComponent(batchId)}&format=${format}`;
}

function normaliseSearchValue(input: string | string[] | undefined): string {
  if (!input) return "";
  const value = Array.isArray(input) ? input[0] : input;
  return value?.toString().trim() ?? "";
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const searchValue = normaliseSearchValue(resolvedSearchParams?.q);

  let query = supabase
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
        current_owner_facility_id,
        facilities:facilities!batches_current_owner_facility_id_fkey ( name, type )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (searchValue) {
    const escaped = searchValue
      .replace(/[%]/g, "\\%")
      .replace(/_/g, "\\_")
      .replace(/,/g, " ");
    const pattern = `%${escaped}%`;

    query = query.or(
      [
        `gtin.ilike.${pattern}`,
        `lot.ilike.${pattern}`,
        `product_name.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await query;

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  const batches = (data as BatchRow[] | null) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Export custody evidence for batches you can access. Each report bundles Hedera timeline entries with database events for end-to-end verification."
        icon={FileText}
      />

      <Card className="border-2">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Batch Finder</CardTitle>
              <CardDescription>
                Search by GTIN, lot, or product name. Showing up to 100 batches that
                match your facility&apos;s visibility.
              </CardDescription>
            </div>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row" action="/reports">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="q"
                placeholder="Search GTIN, lot, or product…"
                defaultValue={searchValue}
                aria-label="Search batches"
                className="pl-10 h-11"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="lg">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
              {searchValue ? (
                <Button variant="outline" size="lg" asChild>
                  <Link href="/reports">Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
          {batches.length > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary" className="text-xs">
                {batches.length} result{batches.length === 1 ? "" : "s"}
              </Badge>
              {searchValue && (
                <Badge variant="outline" className="text-xs">
                  Filtered by: {searchValue}
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {batches.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No batches found"
              description={
                searchValue
                  ? "No batches matched your search query. Try different keywords or clear the search to see all batches."
                  : "No batches matched your facility's visibility or row-level security filters. Confirm that your facility owns the batch you're looking for."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">GTIN</TableHead>
                    <TableHead className="font-semibold">Lot</TableHead>
                    <TableHead className="font-semibold">Expiry</TableHead>
                    <TableHead className="font-semibold">Quantity</TableHead>
                    <TableHead className="font-semibold">Current Owner</TableHead>
                    <TableHead className="font-semibold">Created</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id} className="group hover:bg-muted/30">
                      <TableCell className="max-w-[220px] truncate">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{batch.product_name ?? "—"}</span>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{formatDate(batch.expiry)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{formatQuantity(batch.qty)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{resolveOwner(batch)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{formatDate(batch.created_at)}</span>
                        </div>
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
                                href={`/batches/${batch.id}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                                View Timeline
                              </Link>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
