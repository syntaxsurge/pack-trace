import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  buildGs1DatamatrixPayload,
  type Gs1DatamatrixPayload,
} from "@/lib/labels/gs1";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serverEnv } from "@/lib/env/server";
import {
  buildHashscanTopicUrl,
  buildMirrorMessageUrl,
  buildMirrorTopicUrl,
} from "@/lib/hedera/links";
import { loadBatchTimeline } from "@/lib/hedera/timeline-service";
import { type CustodyTimelineEntry } from "@/lib/hedera/timeline";
import { decodeCursorParam, encodeCursorParam } from "@/lib/utils/cursor";
import { formatConsensusTimestamp } from "@/lib/hedera/format";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Package,
  Calendar,
  Hash,
  Building2,
  Activity,
  Database,
  AlertCircle,
  Info,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import TopicLinksPanel from "./topic-links";
import {
  LabelIdentityPanel,
  LabelIdentityZoomTrigger,
} from "@/app/(workspace)/batches/_components/label-identity-panel";
import { suposConfig } from "@/lib/supos/config";
import { SuposAlertBanner } from "./_components/supos-alert-banner";

export const dynamic = "force-dynamic";

interface BatchRecord {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  label_text: string | null;
  current_owner_facility_id: string | null;
  topic_id: string | null;
  created_at: string;
}

interface EventRecord {
  id: string;
  type: string;
  created_at: string;
  hcs_seq_no: number | null;
  hcs_tx_id: string | null;
  payload_hash: string | null;
  from_facility_id: string | null;
  to_facility_id: string | null;
}

interface PageProps {
  params: Promise<{
    batchId: string;
  }>;
  searchParams: Promise<{
    cursor?: string | string[];
  }>;
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

function formatIsoDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatEventType(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

function getTopicId(batch: BatchRecord): string | null {
  if (batch.topic_id) return batch.topic_id;
  if (serverEnv.hederaTopicId) return serverEnv.hederaTopicId;
  return null;
}

function formatFacilityId(value: string | null | undefined) {
  if (!value) return "—";
  return value;
}

function formatQuantity(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("en").format(value);
  } catch {
    return value.toString();
  }
}

function formatRawMessage(message: string): string {
  try {
    const parsed = JSON.parse(message) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return message;
  }
}

export default async function BatchTimelinePage({
  params,
  searchParams,
}: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const batchIdResult = z.string().uuid().safeParse(resolvedParams.batchId);
  if (!batchIdResult.success) {
    notFound();
  }
  const batchId = batchIdResult.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profileResponse = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error && profileResponse.error.code !== "PGRST116") {
    throw new Error(profileResponse.error.message);
  }

  const userRole = (profileResponse.data?.role as string | null) ?? null;

  const eventsResponse = await supabase
    .from("events")
    .select(
      "id, type, created_at, hcs_seq_no, hcs_tx_id, payload_hash, from_facility_id, to_facility_id",
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false });

  if (eventsResponse.error && eventsResponse.error.code !== "PGRST116") {
    throw new Error(eventsResponse.error.message);
  }

  const events = ((eventsResponse.data as EventRecord[]) ?? []).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  const batchResponse = await supabase
    .from("batches")
    .select(
      "id, product_name, gtin, lot, expiry, qty, label_text, current_owner_facility_id, topic_id, created_at",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (batchResponse.error) {
    if (batchResponse.error.code === "22P02") {
      notFound();
    }
    if (batchResponse.error.code !== "PGRST116") {
      throw new Error(batchResponse.error.message);
    }
  }

  const batch = (batchResponse.data as BatchRecord | null) ?? null;

  if (!batch) {
    if (events.length > 0) {
      return (
        <div className="space-y-8">
          <PageHeader
            title="Batch Timeline"
            description="Review on-ledger custody events for this batch, cross-referenced with database records."
            icon={Activity}
          />

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This batch is no longer assigned to your facility, so viewing its timeline requires the current custodian or an auditor to share access.
            </AlertDescription>
          </Alert>

          <div>
            <Link
              href="/batches"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <ChevronRight className="h-3 w-3" />
              Back to batches
            </Link>
          </div>
        </div>
      );
    }

    notFound();
  }

  let labelPayload: Gs1DatamatrixPayload | null = null;
  try {
    labelPayload = buildGs1DatamatrixPayload({
      productName: batch.product_name ?? batch.gtin,
      gtin: batch.gtin,
      lot: batch.lot,
      expiry: batch.expiry,
      quantity: batch.qty,
    });
  } catch (error) {
    console.error("label identity build failed", batch.id, error);
    labelPayload = null;
  }

  const cursor = decodeCursorParam(resolvedSearchParams.cursor);

  const topicId = getTopicId(batch);

  let timelineEntries: CustodyTimelineEntry[] = [];
  let nextCursor: string | null = null;
  let timelineError: string | null = null;
  let timelineNote: string | null = null;

  if (topicId) {
    const timeline = await loadBatchTimeline({
      topicId,
      identifiers: {
        gtin: batch.gtin,
        lot: batch.lot,
        expiry: batch.expiry,
      },
      cursor,
      limit: 50,
    });

    timelineEntries = timeline.entries;
    nextCursor = timeline.nextCursor;
    timelineNote = timeline.note;
    timelineError = timeline.error;
  } else {
    timelineError =
      "This batch is not linked to a Hedera topic. Set `batches.topic_id` or configure `HEDERA_TOPIC_ID` to enable timeline sync.";
  }

  const latestLedgerEntry = timelineEntries.reduce<CustodyTimelineEntry | null>(
    (accumulator, entry) =>
      !accumulator || entry.sequenceNumber > accumulator.sequenceNumber
        ? entry
        : accumulator,
    null,
  );

  const latestLedgerSequence = latestLedgerEntry?.sequenceNumber ?? null;
  const latestLedgerTimestamp = latestLedgerEntry?.consensusTimestamp ?? null;

  const latestDatabaseSequence = events.reduce<number | null>(
    (accumulator, event) => {
      if (typeof event.hcs_seq_no !== "number") {
        return accumulator;
      }

      if (accumulator === null || event.hcs_seq_no > accumulator) {
        return event.hcs_seq_no;
      }

      return accumulator;
    },
    null,
  );

  const latestSequence = latestLedgerSequence ?? latestDatabaseSequence;
  const sequenceSource: "ledger" | "database" | null =
    latestLedgerSequence !== null
      ? "ledger"
      : latestDatabaseSequence !== null
        ? "database"
        : null;

  const latestConsensusDisplay =
    sequenceSource === "ledger" && latestLedgerTimestamp
      ? formatConsensusTimestamp(latestLedgerTimestamp)
      : null;

  const mirrorFeedUrl =
    topicId !== null
      ? buildMirrorTopicUrl(serverEnv.network, topicId, {
          order: "desc",
          limit: 5,
        })
      : null;

  const hashscanTopicUrl =
    topicId !== null
      ? buildHashscanTopicUrl(serverEnv.network, topicId)
      : null;

  const hashscanMessageUrl =
    sequenceSource === "ledger" && hashscanTopicUrl ? hashscanTopicUrl : null;

  const hasDatabaseLedgerOnly =
    !timelineError &&
    timelineEntries.length === 0 &&
    events.some((event) => event.hcs_seq_no !== null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Batch Timeline"
        description="Review on-ledger custody events for this batch, cross-referenced with database records."
        icon={Activity}
      />

      <section className="space-y-6">
        <SuposAlertBanner batchId={batch.id} enabled={suposConfig.enabled} />

        {labelPayload ? (
          <LabelIdentityPanel
            labelText={labelPayload.humanReadable}
            batchId={batch.id}
            productName={batch.product_name}
            gtin={labelPayload.gtin14}
            lot={labelPayload.lot}
            expiry={labelPayload.expiryIsoDate}
            quantity={batch.qty}
            facilityName={null}
            userRole={userRole}
            printLabel="Reprint label"
            note="Labels are generated as GS1 DataMatrix symbols with a fixed checksum. Reprint without scaling for reliable scans."
          />
        ) : batch.label_text ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Stored label data is invalid. Update the batch details to regenerate the GS1 label.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No GS1 label is associated with this batch.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Batch Information</CardTitle>
                <CardDescription>
                  Key identifiers and metadata for this batch
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  <span>Product</span>
                </div>
                <p className="font-medium">{batch.product_name ?? "—"}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>GTIN</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {batch.gtin}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>Lot</span>
                </div>
                <Badge variant="secondary" className="font-mono">
                  {batch.lot}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Expiry</span>
                </div>
                <p className="font-medium">{formatDate(batch.expiry)}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>Quantity</span>
                </div>
                <p className="font-medium">{formatQuantity(batch.qty)}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Created</span>
                </div>
                <p className="font-medium">{formatDate(batch.created_at)}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>Current Owner</span>
                </div>
                <p className="font-medium">{formatFacilityId(batch.current_owner_facility_id)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Hedera Custody Timeline</CardTitle>
                <CardDescription>
                  Entries are fetched from the configured Hedera topic and filtered by
                  this batch&apos;s GS1 identifiers.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {topicId ? (
              <TopicLinksPanel
                topicId={topicId}
                network={serverEnv.network}
                latestSequence={latestSequence}
                sequenceSource={sequenceSource}
                latestConsensusDisplay={latestConsensusDisplay}
                mirrorFeedUrl={mirrorFeedUrl}
                hashscanTopicUrl={hashscanTopicUrl}
                hashscanMessageUrl={hashscanMessageUrl}
              />
            ) : null}

            {timelineError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{timelineError}</AlertDescription>
              </Alert>
            ) : null}

            {hasDatabaseLedgerOnly ? (
              <Alert className="bg-warning/10 border-warning/50">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning-foreground">
                  Database events reference Hedera sequence numbers, but no matching
                  Mirror Node messages were found yet. Confirm the topic ID is
                  correct and run the workflow live to produce on-ledger entries.
                </AlertDescription>
              </Alert>
            ) : null}

            {timelineNote && !timelineError ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>{timelineNote}</AlertDescription>
              </Alert>
            ) : null}

            {timelineEntries.length === 0 && !timelineError && !timelineNote ? (
              <EmptyState
                icon={Activity}
                title="No timeline entries"
                description="No Hedera messages have been recorded for this batch yet. Timeline entries will appear here once custody events are published to the Hedera network."
              />
            ) : null}

            {timelineEntries.map((entry) => (
              <div
                key={`${entry.sequenceNumber}-${entry.consensusTimestamp}`}
                className="relative border-l-2 border-primary/30 pl-6 pb-4"
              >
                <span className="absolute left-0 top-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <Badge variant="secondary" className="uppercase tracking-wide font-semibold">
                    {formatEventType(entry.type)}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span className="uppercase tracking-wide font-medium">
                      Sequence #{entry.sequenceNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatConsensusTimestamp(entry.consensusTimestamp)}</span>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Actor facility</dt>
                    <dd className="font-medium break-all">
                      {formatFacilityId(entry.actor.facilityId)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Actor role</dt>
                    <dd className="font-medium uppercase tracking-wide">
                      {entry.actor.role}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Recipient facility</dt>
                    <dd className="font-medium break-all">
                      {formatFacilityId(entry.to?.facilityId)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Linked hash</dt>
                    <dd className="font-mono text-xs break-all">
                      {entry.prev ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground break-all">
                    Running hash:{" "}
                    <span className="font-mono break-all">{entry.runningHash}</span>
                  </span>
                  {topicId ? (
                    <a
                      href={buildMirrorMessageUrl(
                        serverEnv.network,
                        topicId,
                        entry.sequenceNumber,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      View on Mirror Node
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-medium text-primary">
                    Payload
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/80">
                    {formatRawMessage(entry.rawMessage)}
                  </pre>
                </details>
              </div>
            ))}

            {nextCursor ? (
              <Link
                href={{
                  pathname: `/batches/${batch.id}`,
                  query: {
                    cursor: encodeCursorParam(nextCursor),
                  },
                }}
                prefetch={false}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Load older entries
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Database Events</CardTitle>
                <CardDescription>
                  Events stored in Postgres for this batch, ordered by creation time.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {events.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No events"
                description="No events have been recorded in the database for this batch."
              />
            ) : null}
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border-2 p-4 hover:bg-muted/30 transition-colors">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="uppercase tracking-wide font-semibold">
                    {formatEventType(event.type)}
                  </Badge>
                  {event.type?.toUpperCase() === "MANUFACTURED" ? (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <LabelIdentityZoomTrigger />
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                  <Calendar className="h-3 w-3" />
                  <span>{formatIsoDateTime(event.created_at)}</span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">HCS Sequence</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {event.hcs_seq_no ?? "—"}
                    </Badge>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">HCS Transaction</span>
                    <span className="font-mono text-xs break-all text-right">
                      {event.hcs_tx_id ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Payload Hash</span>
                    <span className="font-mono text-xs break-all text-right">
                      {event.payload_hash ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      From
                    </span>
                    <span className="font-medium">{formatFacilityId(event.from_facility_id)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      To
                    </span>
                    <span className="font-medium">{formatFacilityId(event.to_facility_id)}</span>
                  </div>
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
