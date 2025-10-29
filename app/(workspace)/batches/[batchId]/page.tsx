import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverEnv } from "@/lib/env/server";
import {
  buildHashscanMessageUrl,
  buildHashscanTopicUrl,
  buildMirrorMessageUrl,
  buildMirrorTopicUrl,
} from "@/lib/hedera/links";
import { loadBatchTimeline } from "@/lib/hedera/timeline-service";
import { type CustodyTimelineEntry } from "@/lib/hedera/timeline";
import { decodeCursorParam, encodeCursorParam } from "@/lib/utils/cursor";
import { formatConsensusTimestamp } from "@/lib/hedera/format";
import { createClient } from "@/lib/supabase/server";
import TopicLinksPanel from "./topic-links";

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
    notFound();
  }

  const eventsResponse = await supabase
    .from("events")
    .select(
      "id, type, created_at, hcs_seq_no, hcs_tx_id, payload_hash, from_facility_id, to_facility_id",
    )
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: false });

  if (eventsResponse.error && eventsResponse.error.code !== "PGRST116") {
    throw new Error(eventsResponse.error.message);
  }

  const events = ((eventsResponse.data as EventRecord[]) ?? []).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

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
    sequenceSource === "ledger" && topicId && latestLedgerSequence !== null
      ? buildHashscanMessageUrl(
          serverEnv.network,
          topicId,
          latestLedgerSequence,
        )
      : null;

  const hasDatabaseLedgerOnly =
    !timelineError &&
    timelineEntries.length === 0 &&
    events.some((event) => event.hcs_seq_no !== null);

  const labelImageUrl = `/api/batches/${batch.id}/label?format=png`;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Batch timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Review on-ledger custody events for this batch, cross-referenced with
            database records.
          </p>
          {batch.label_text ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-40 w-40 items-center justify-center rounded-lg border bg-white p-3 shadow-sm dark:bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={labelImageUrl}
                    alt={`GS1 DataMatrix for ${batch.label_text}`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={labelImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open PNG
                  </a>
                  <span className="text-xs text-muted-foreground">·</span>
                  <a
                    href={`/api/batches/${batch.id}/label`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="font-mono text-[11px]">{batch.label_text}</p>
                <p>
                  Labels are generated as GS1 DataMatrix symbols (not QR codes).
                  They require a light margin—print without scaling for reliable scans.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Product</span>
            <span className="font-medium">
              {batch.product_name ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">GTIN</span>
            <span className="font-medium">{batch.gtin}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Lot</span>
            <span className="font-medium">{batch.lot}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Expiry</span>
            <span className="font-medium">{formatDate(batch.expiry)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium">{formatQuantity(batch.qty)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Current owner</span>
            <span className="font-medium">
              {formatFacilityId(batch.current_owner_facility_id)}
            </span>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Hedera custody timeline</CardTitle>
            <CardDescription>
              Entries are fetched from the configured Hedera topic and filtered by
              this batch&apos;s GS1 identifiers.
            </CardDescription>
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
              <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {timelineError}
              </div>
            ) : null}

            {hasDatabaseLedgerOnly ? (
              <div className="rounded border border-amber-300/40 bg-amber-500/10 p-4 text-sm text-amber-900">
                Database events reference Hedera sequence numbers, but no matching
                Mirror Node messages were found yet. Confirm the topic ID is
                correct and run the workflow live to produce on-ledger entries.
              </div>
            ) : null}
            {timelineNote && !timelineError ? (
              <div className="rounded border border-muted/60 bg-muted/40 p-4 text-sm text-muted-foreground">
                {timelineNote}
              </div>
            ) : null}

            {timelineEntries.length === 0 && !timelineError && !timelineNote ? (
              <p className="text-sm text-muted-foreground">
                No Hedera messages have been recorded for this batch.
              </p>
            ) : null}

            {timelineEntries.map((entry) => (
              <div
                key={`${entry.sequenceNumber}-${entry.consensusTimestamp}`}
                className="relative border-l pl-6"
              >
                <span className="absolute left-0 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary" className="uppercase tracking-wide">
                    {formatEventType(entry.type)}
                  </Badge>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Sequence #{entry.sequenceNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatConsensusTimestamp(entry.consensusTimestamp)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Actor facility</dt>
                    <dd className="font-medium">
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
                    <dd className="font-medium">
                      {formatFacilityId(entry.to?.facilityId)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Linked hash</dt>
                    <dd className="font-mono text-xs">
                      {entry.prev ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Running hash: {entry.runningHash}</span>
                  {topicId ? (
                    <a
                      href={buildMirrorMessageUrl(
                        serverEnv.network,
                        topicId,
                        entry.sequenceNumber,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      View on Mirror Node
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
                className="inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Load older entries
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database events</CardTitle>
            <CardDescription>
              Events stored in Postgres for this batch, ordered by creation time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {events.length === 0 ? (
              <p className="text-muted-foreground">
                No events have been recorded in the database for this batch.
              </p>
            ) : null}
            {events.map((event) => (
              <div key={event.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="uppercase tracking-wide">
                    {formatEventType(event.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatIsoDateTime(event.created_at)}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>HCS seq</span>
                    <span>{event.hcs_seq_no ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>HCS tx</span>
                    <span className="font-mono">
                      {event.hcs_tx_id ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payload hash</span>
                    <span className="font-mono">
                      {event.payload_hash ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>From</span>
                    <span>{formatFacilityId(event.from_facility_id)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>To</span>
                    <span>{formatFacilityId(event.to_facility_id)}</span>
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
