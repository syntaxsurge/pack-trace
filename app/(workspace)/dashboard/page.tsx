import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Boxes,
  FileText,
  Printer,
  QrCode,
  ReceiptText,
  ScanLine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type Profile = {
  display_name: string | null;
  role: string;
  facility_id: string | null;
};

type Facility = {
  name: string;
  type: string;
  country: string | null;
  gs1_company_prefix: string | null;
  created_at: string;
};

type BatchSummary = {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  created_at: string;
  current_owner_facility_id: string | null;
};

type EventSummary = {
  id: string;
  type: string;
  created_at: string;
  batch_id: string;
  hcs_seq_no: number | null;
  hcs_running_hash: string | null;
  batches?: {
    current_owner_facility_id: string | null;
    pending_receipt_to_facility_id?: string | null;
  } | null;
};

type QuickAction = {
  key: string;
  title: string;
  description: string;
  href: Route;
  icon: LucideIcon;
};

const BASE_ACTIONS: QuickAction[] = [
  {
    key: "scan",
    title: "Log custody event",
    description:
      "Scan a GS1 DataMatrix to receive, hand over, or dispense a pack.",
    href: "/scan",
    icon: ScanLine,
  },
  {
    key: "batches",
    title: "Review batches",
    description:
      "Check recent batches, timelines, and Hedera sequence numbers.",
    href: "/batches",
    icon: Boxes,
  },
  {
    key: "reports",
    title: "Traceability reports",
    description: "Export PDF or CSV custody evidence for auditors.",
    href: "/reports",
    icon: FileText,
  },
];

const ROLE_ACTIONS: Record<string, QuickAction[]> = {
  MANUFACTURER: [
    {
      key: "create-batch",
      title: "Create new batch",
      description:
        "Register GTIN, lot, expiry, and quantity before printing labels.",
      href: "/batches/new",
      icon: QrCode,
    },
    {
      key: "print-labels",
      title: "Print label sheet",
      description:
        "Download or print GS1 DataMatrix labels after creation.",
      href: "/batches/new",
      icon: Printer,
    },
  ],
  DISTRIBUTOR: [
    {
      key: "handover",
      title: "Receive & handover",
      description:
        "Scan inbound shipments and route them to the next facility.",
      href: "/scan",
      icon: Boxes,
    },
  ],
  PHARMACY: [
    {
      key: "dispense",
      title: "Dispense with receipt",
      description:
        "Verify authenticity, record dispense events, and issue receipts.",
      href: "/scan",
      icon: ReceiptText,
    },
  ],
  AUDITOR: [
    {
      key: "audit",
      title: "Download traceability certificate",
      description:
        "Export Hedera-backed PDFs or CSVs for the selected batch.",
      href: "/reports",
      icon: FileText,
    },
  ],
  ADMIN: [
    {
      key: "manage-batches",
      title: "Manage facility inventory",
      description:
        "Cross-check batches owned by facilities you administer.",
      href: "/batches",
      icon: Boxes,
    },
  ],
  STAFF: [],
};

function uniqueActions(actions: QuickAction[]): QuickAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const id = action.href;
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function normalizeRole(role: string | null | undefined): string {
  if (!role) return "STAFF";
  return role.toUpperCase();
}

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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    profileResponse,
    batchesCountResponse,
    batchListResponse,
    eventsCountResponse,
    eventListResponse,
    activeReceiptCountResponse,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("display_name, role, facility_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("batches").select("id", { count: "exact", head: true }),
    supabase
      .from("batches")
      .select(
        "id, product_name, gtin, lot, expiry, qty, created_at, current_owner_facility_id",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select(
        `
        id,
        type,
        created_at,
        batch_id,
        hcs_seq_no,
        hcs_running_hash,
        batches!events_batch_id_fkey (
          current_owner_facility_id,
          pending_receipt_to_facility_id
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
  ]);

  if (profileResponse.error && profileResponse.error.code !== "PGRST116") {
    throw new Error(profileResponse.error.message);
  }

  const profile = (profileResponse.data as Profile | null) ?? null;
  let facility: Facility | null = null;

  if (profile?.facility_id) {
    const facilityResponse = await supabase
      .from("facilities")
      .select("name, type, country, gs1_company_prefix, created_at")
      .eq("id", profile.facility_id)
      .maybeSingle();

    facility = facilityResponse.data as Facility | null;
  }

  if (batchListResponse.error && batchListResponse.error.code !== "PGRST116") {
    throw new Error(batchListResponse.error.message);
  }

  if (eventListResponse.error && eventListResponse.error.code !== "PGRST116") {
    throw new Error(eventListResponse.error.message);
  }

  const recentBatches =
    (batchListResponse.data as BatchSummary[] | null) ?? [];
  const recentEvents = (eventListResponse.data as EventSummary[] | null) ?? [];
  const roleKey = normalizeRole(profile?.role);
  const quickActions = uniqueActions([
    ...(ROLE_ACTIONS[roleKey] ?? ROLE_ACTIONS.STAFF),
    ...BASE_ACTIONS,
  ]).slice(0, 6);

  const stats = [
    {
      label: "Batches tracked",
      value: batchesCountResponse.count ?? 0,
    },
    {
      label: "Events recorded",
      value: eventsCountResponse.count ?? 0,
    },
    {
      label: "Active receipts",
      value: activeReceiptCountResponse.count ?? 0,
    },
  ];

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back
              {profile?.display_name ? `, ${profile.display_name}` : ""}.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track custody events, confirm GS1 identifiers, and audit every batch synced to Hedera.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="uppercase tracking-wide">
              {roleKey}
            </Badge>
            {facility?.type ? (
              <Badge variant="secondary" className="uppercase tracking-wide">
                {facility.type}
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Card key={action.key} className="shadow-sm transition hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle className="text-base font-semibold">
                  {action.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>{action.description}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={action.href}>
                    Go
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Facility profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium uppercase tracking-wide">
                {profile?.role ?? "STAFF"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">Facility</span>
              <span className="font-medium">
                {facility?.name ?? "Pending assignment"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">
                {facility?.type ?? "—"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">GS1 company prefix</span>
              <span className="font-medium">
                {facility?.gs1_company_prefix ?? "—"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">Country</span>
              <span className="font-medium">
                {facility?.country ?? "—"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-6">
              <span className="text-muted-foreground">Onboarded</span>
              <span className="font-medium">
                {formatDate(facility?.created_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {recentBatches.length === 0 ? (
              <div className="space-y-2 text-muted-foreground">
                <p>
                  No batches found for your facility yet. Create one to generate
                  GS1 DataMatrix labels and publish a manufacturing event.
                </p>
                <Link
                  href="/batches/new"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Go to batch creation
                </Link>
              </div>
            ) : (
              recentBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{batch.product_name ?? "Batch"}</p>
                    <p className="text-xs text-muted-foreground">
                      GTIN {batch.gtin} · Lot {batch.lot}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(batch.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end text-xs text-muted-foreground">
                    <span>{batch.qty} units</span>
                    <span>Expires {formatDate(batch.expiry)}</span>
                    <Link
                      href={{
                        pathname: `/batches/${batch.id}`,
                      }}
                      prefetch={false}
                      className="mt-2 text-primary hover:underline"
                    >
                      View timeline
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Latest custody events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {recentEvents.length === 0 ? (
              <p className="text-muted-foreground">
                Custody events will appear here after you scan or hand over a batch. Each record mirrors a Hedera consensus message.
              </p>
            ) : (
              recentEvents.map((event) => (
                <DashboardEventCard
                  key={event.id}
                  event={event}
                  facilityId={profile?.facility_id ?? null}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

interface DashboardEventCardProps {
  event: EventSummary;
  facilityId: string | null;
}

function DashboardEventCard({ event, facilityId }: DashboardEventCardProps) {
  const batchLink = `/batches/${event.batch_id}` as Route;
  const pendingFacilityId = event.batches?.pending_receipt_to_facility_id ?? null;
  const hasPendingReceipt = Boolean(pendingFacilityId);
  const recipientIsCurrentFacility = hasPendingReceipt && pendingFacilityId === facilityId;
  const isReceivable = recipientIsCurrentFacility && event.type === "HANDOVER";
  const canNavigate = !hasPendingReceipt;

  const statusLabel = (() => {
    if (isReceivable) {
      return "Awaiting receipt";
    }
    if (hasPendingReceipt) {
      return "Pending confirmation";
    }
    return null;
  })();

  const containerClass = cn(
    "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
    hasPendingReceipt ? "border-amber-300 bg-amber-50" : "",
  );

  return (
    <div className={containerClass}>
      <div className="space-y-1">
        <p className="font-medium uppercase tracking-wide">{event.type}</p>
        <p className="text-xs text-muted-foreground">
          Batch {event.batch_id} · Seq #{event.hcs_seq_no ?? "pending"}
        </p>
        {statusLabel ? (
          <Badge variant={isReceivable ? "secondary" : "outline"}>{statusLabel}</Badge>
        ) : null}
      </div>
      <div className="flex flex-col items-end text-xs text-muted-foreground">
        <span>{formatDate(event.created_at)}</span>
        {canNavigate ? (
          <Link
            href={{ pathname: batchLink }}
            prefetch={false}
            className="mt-2 text-primary hover:underline"
          >
            Open batch
          </Link>
        ) : (
          <span className="mt-2 text-amber-700">
            Pending receipt at destination
          </span>
        )}
      </div>
    </div>
  );
}
