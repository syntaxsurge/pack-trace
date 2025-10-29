import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export custody evidence for batches you can access. Each report bundles
          Hedera timeline entries with database events for end-to-end verification.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Batch finder</CardTitle>
          <CardDescription>
            Search by GTIN, lot, or product name. Showing up to 100 batches that
            match your facility&apos;s visibility.
          </CardDescription>
          <form className="flex flex-col gap-3 pt-2 sm:flex-row" action="/reports">
            <Input
              name="q"
              placeholder="Search GTIN, lot, or product…"
              defaultValue={searchValue}
              aria-label="Search batches"
            />
            <div className="flex gap-2">
              <Button type="submit">Search</Button>
              {searchValue ? (
                <Button variant="ghost" asChild>
                  <Link href="/reports">Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardHeader>

        <CardContent>
          {batches.length === 0 ? (
            <p className="rounded border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
              No batches matched your query or row-level security filters. Try a different search or confirm that your facility owns the batch you&apos;re looking for.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>GTIN</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Current owner</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {batch.product_name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {batch.gtin}
                      </TableCell>
                      <TableCell className="font-medium">{batch.lot}</TableCell>
                      <TableCell>{formatDate(batch.expiry)}</TableCell>
                      <TableCell>{formatQuantity(batch.qty)}</TableCell>
                      <TableCell>{resolveOwner(batch)}</TableCell>
                      <TableCell>{formatDate(batch.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                          >
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
