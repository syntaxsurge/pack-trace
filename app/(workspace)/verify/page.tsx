import { serverEnv } from "@/lib/env/server";
import { decodeCursorParam, encodeCursorParam } from "@/lib/utils/cursor";
import { buildMirrorMessageUrl, buildMirrorTopicUrl } from "@/lib/hedera/links";
import { formatConsensusTimestamp } from "@/lib/hedera/format";
import { verifyCode } from "@/lib/verify/service";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VerifyClient } from "./verify-client";
import type { VerifyState, VerifyStatus } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

function formatQuantity(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  try {
    return new Intl.NumberFormat("en").format(value);
  } catch {
    return value.toString();
  }
}

function formatRawMessage(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function resolveStatusMessage(state: VerifyState): string {
  if (state.message) {
    return state.message;
  }

  switch (state.status) {
    case "idle":
      return "Scan a GS1 DataMatrix barcode or paste the encoded value to verify the pack.";
    case "genuine":
      return "This pack matches a custody record published to Hedera.";
    case "unknown":
      return "No custody record was found for the provided identifiers.";
    case "mismatch":
      return "The GTIN and lot match a custody record, but the expiry date differs.";
    case "error":
    default:
      return "Unable to verify the provided code.";
  }
}

function statusTone(status: VerifyStatus) {
  switch (status) {
    case "genuine":
      return {
        badge: "bg-emerald-500 text-white",
        accent: "text-emerald-600",
      };
    case "mismatch":
      return {
        badge: "bg-amber-500 text-black",
        accent: "text-amber-600",
      };
    case "error":
      return {
        badge: "bg-destructive text-destructive-foreground",
        accent: "text-destructive",
      };
    case "unknown":
      return {
        badge: "bg-muted text-muted-foreground",
        accent: "text-muted-foreground",
      };
    case "idle":
    default:
      return {
        badge: "bg-primary text-primary-foreground",
        accent: "text-muted-foreground",
      };
  }
}

export default async function VerifyPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const codeParam = resolvedSearchParams.code;
  const cursorParam = resolvedSearchParams.cursor;

  const code =
    typeof codeParam === "string"
      ? codeParam
      : Array.isArray(codeParam)
        ? codeParam[0] ?? null
        : null;

  const cursor = decodeCursorParam(cursorParam);
  const state = await verifyCode({ code, cursor, limit: 10 });
  const tone = statusTone(state.status);
  const statusLabel = state.status.toUpperCase();
  const statusMessage = resolveStatusMessage(state);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Verify a pack
        </h1>
        <p className="text-sm text-muted-foreground">
          Scan a GS1 DataMatrix label or paste the encoded string to confirm the
          pack&apos;s provenance. Custody events are read from Hedera Mirror
          Node.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan or paste code</CardTitle>
            <CardDescription>
              Supports camera scanning (BarcodeDetector, ZXing fallback) or manual entry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerifyClient state={state} />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Verification status</CardTitle>
            <CardDescription>
              Results are derived from Supabase custody records and Hedera Mirror Node events.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <div className="space-y-4">
              <Badge className={tone.badge}>{statusLabel}</Badge>
              <p className={`text-sm ${tone.accent}`}>{statusMessage}</p>

              {state.parsed ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">GTIN</dt>
                    <dd className="font-medium">{state.parsed.gtin14}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Lot</dt>
                    <dd className="font-medium">{state.parsed.lot}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expiry</dt>
                    <dd className="font-medium">
                      {formatDate(state.parsed.expiryIsoDate)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {state.batch ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Product</dt>
                    <dd className="font-medium">
                      {state.batch.product_name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Quantity</dt>
                    <dd className="font-medium">
                      {formatQuantity(state.batch.qty)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Current owner</dt>
                    <dd className="font-medium">
                      {state.batch.current_owner_facility_id ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Label preview</dt>
                    <dd className="font-mono text-xs">
                      {state.batch.label_text ?? "—"}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              Network: {serverEnv.network}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Latest custody hops
            </h2>
            <p className="text-sm text-muted-foreground">
              Mirror Node entries associated with the scanned pack, ordered by consensus time.
            </p>
          </div>
          {state.topicId ? (
            <a
              href={buildMirrorTopicUrl(serverEnv.network, state.topicId)}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open topic in Mirror Node
            </a>
          ) : null}
        </div>

        {state.timelineError ? (
          <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {state.timelineError}
          </div>
        ) : null}

        {state.timelineNote && !state.timelineError ? (
          <div className="rounded border border-muted/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            {state.timelineNote}
          </div>
        ) : null}

        {state.timelineEntries.length === 0 && !state.timelineError ? (
          <p className="text-sm text-muted-foreground">
            No Hedera messages have been located for these identifiers yet.
          </p>
        ) : (
          <div className="space-y-4">
            {state.timelineEntries.map((entry) => (
              <Card key={`${entry.sequenceNumber}-${entry.consensusTimestamp}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                    <Badge variant="secondary" className="uppercase tracking-wide">
                      {entry.type}
                    </Badge>
                    <span className="text-xs uppercase text-muted-foreground">
                      Seq #{entry.sequenceNumber}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {formatConsensusTimestamp(entry.consensusTimestamp)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Actor facility</dt>
                      <dd className="font-medium">
                        {entry.actor.facilityId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Actor role</dt>
                      <dd className="font-medium uppercase tracking-wide">
                        {entry.actor.role}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Recipient facility</dt>
                      <dd className="font-medium">
                        {entry.to?.facilityId ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Running hash</dt>
                      <dd className="font-mono text-xs">{entry.runningHash}</dd>
                    </div>
                  </dl>
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-primary">
                      Payload
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/80">
                      {formatRawMessage(entry.rawMessage)}
                    </pre>
                  </details>
                  {state.topicId ? (
                    <a
                      href={buildMirrorMessageUrl(
                        serverEnv.network,
                        state.topicId,
                        entry.sequenceNumber,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      View on Mirror Node
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {state.nextCursor && state.code ? (
          <a
            href={`/verify?code=${encodeURIComponent(
              state.code,
            )}&cursor=${encodeCursorParam(state.nextCursor)}`}
            className="inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Load older entries
          </a>
        ) : null}
      </section>
    </div>
  );
}
