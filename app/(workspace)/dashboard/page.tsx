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
  TrendingUp,
  AlertCircle,
  Package,
  Activity,
  Building2,
  Calendar,
  MapPin,
  Hash,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { StatsCard } from "@/components/stats-card";
import { EmptyState } from "@/components/empty-state";

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
    <div className="space-y-8">
      {/* Welcome Header */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gradient-to-br from-primary to-accent p-2">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Welcome back
                  {profile?.display_name ? `, ${profile.display_name}` : ""}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {facility?.name ?? "Your facility"}
                </p>
              </div>
            </div>
            <p className="text-base text-muted-foreground max-w-2xl">
              Track custody events, confirm GS1 identifiers, and audit every batch synced to Hedera.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="h-8 px-3 text-sm font-semibold uppercase">
              {roleKey}
            </Badge>
            {facility?.type ? (
              <Badge variant="secondary" className="h-8 px-3 text-sm font-semibold uppercase">
                {facility.type}
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid gap-6 sm:grid-cols-3">
        <StatsCard
          title="Batches Tracked"
          value={batchesCountResponse.count ?? 0}
          icon={Package}
          description="Total batches in the system"
        />
        <StatsCard
          title="Events Recorded"
          value={eventsCountResponse.count ?? 0}
          icon={Activity}
          description="Custody events logged"
        />
        <StatsCard
          title="Active Receipts"
          value={activeReceiptCountResponse.count ?? 0}
          icon={ReceiptText}
          description="Dispensed with receipts"
        />
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Quick Actions</h2>
            <p className="text-sm text-muted-foreground">Common tasks for your role</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.key}
                className="group relative overflow-hidden border-2 transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <Link href={action.href} className="block">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg font-semibold group-hover:text-primary transition-colors">
                        {action.title}
                      </CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {action.description}
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
            );
          })}
        </div>
      </section>

      {/* Facility Profile & Recent Batches */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Facility Profile</CardTitle>
                <CardDescription>Your organization details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline" className="h-6 w-6 p-0 justify-center">
                    R
                  </Badge>
                  <span>Role</span>
                </div>
                <Badge variant="default" className="font-semibold uppercase">
                  {profile?.role ?? "STAFF"}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>Facility</span>
                </div>
                <span className="font-semibold text-right max-w-[200px] truncate">
                  {facility?.name ?? "Pending assignment"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  <span>Type</span>
                </div>
                <span className="font-semibold">
                  {facility?.type ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>GS1 Prefix</span>
                </div>
                <span className="font-mono font-semibold">
                  {facility?.gs1_company_prefix ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>Country</span>
                </div>
                <span className="font-semibold">
                  {facility?.country ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Onboarded</span>
                </div>
                <span className="font-semibold">
                  {formatDate(facility?.created_at)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <Package className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Recent Batches</CardTitle>
                  <CardDescription>Latest registered batches</CardDescription>
                </div>
              </div>
              {recentBatches.length > 0 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/batches">View all</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentBatches.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No batches yet"
                description="Create your first batch to generate GS1 DataMatrix labels and publish a manufacturing event."
                action={{
                  label: "Create Batch",
                  onClick: () => {},
                }}
              />
            ) : (
              recentBatches.map((batch) => (
                <Card
                  key={batch.id}
                  className="overflow-hidden border-l-4 border-l-primary"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate">
                          {batch.product_name ?? "Batch"}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="font-mono">
                            GTIN {batch.gtin}
                          </Badge>
                          <Badge variant="outline" className="font-mono">
                            Lot {batch.lot}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {batch.qty} units
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Exp: {formatDate(batch.expiry)}
                          </span>
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/batches/${batch.id}` as Route}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Latest Custody Events */}
      <section>
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-success/10 p-2">
                  <Activity className="h-5 w-5 text-success" />
                </div>
                <div>
                  <CardTitle>Latest Custody Events</CardTitle>
                  <CardDescription>Recent blockchain-backed transactions</CardDescription>
                </div>
              </div>
              {recentEvents.length > 0 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/batches">View all</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No events yet"
                description="Custody events will appear here after you scan or hand over a batch. Each record mirrors a Hedera consensus message."
              />
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <DashboardEventCard
                    key={event.id}
                    event={event}
                    facilityId={profile?.facility_id ?? null}
                  />
                ))}
              </div>
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
      return { text: "Awaiting receipt", variant: "warning" as const };
    }
    if (hasPendingReceipt) {
      return { text: "Pending confirmation", variant: "secondary" as const };
    }
    return null;
  })();

  const eventTypeColors: Record<string, string> = {
    MANUFACTURED: "bg-success/10 text-success border-success/20",
    HANDOVER: "bg-info/10 text-info border-info/20",
    RECEIVED: "bg-primary/10 text-primary border-primary/20",
    DISPENSED: "bg-accent/10 text-accent border-accent/20",
  };

  return (
    <Card
      className={cn(
        "border-l-4 transition-all hover:shadow-md",
        hasPendingReceipt
          ? "border-l-warning bg-warning/5"
          : "border-l-success"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "font-semibold uppercase",
                  eventTypeColors[event.type] || "bg-muted/10"
                )}
              >
                {event.type}
              </Badge>
              {statusLabel && (
                <Badge variant={statusLabel.variant === "warning" ? "outline" : statusLabel.variant}>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {statusLabel.text}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Batch {event.batch_id.substring(0, 8)}...
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  Seq #{event.hcs_seq_no ?? "pending"}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(event.created_at)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {canNavigate ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={{ pathname: batchLink }} prefetch={false}>
                  View
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Alert className="p-2">
                <AlertDescription className="text-xs">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Pending receipt
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
