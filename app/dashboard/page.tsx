import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        "id, gtin, lot, expiry, qty, created_at, current_owner_facility_id",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id, type, created_at, batch_id, hcs_seq_no, hcs_running_hash")
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

  const recentBatches = batchListResponse.data ?? [];
  const recentEvents = eventListResponse.data ?? [];

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
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use this dashboard to track custody events, confirm GS1 identifiers,
          and audit batches synced to Hedera.
        </p>
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
              <p className="text-muted-foreground">
                No batches found for your facility yet. Create one to generate
                GS1 DataMatrix labels and publish a manufacturing event.
              </p>
            ) : (
              recentBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      GTIN {batch.gtin} · Lot {batch.lot}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(batch.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end text-xs text-muted-foreground">
                    <span>{batch.qty} units</span>
                    <span>Expires {formatDate(batch.expiry)}</span>
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
                Custody events will appear here after you scan or hand over a
                batch. Each record mirrors a Hedera consensus message.
              </p>
            ) : (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium uppercase tracking-wide">
                      {event.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Batch {event.batch_id} · Seq #
                      {event.hcs_seq_no ?? "pending"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(event.created_at)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
