import { formatConsensusTimestamp } from "@/lib/hedera/format";

import type { TraceabilitySnapshot } from "./data";

function escapeCsvValue(value: string): string {
  if (value === "") {
    return "";
  }

  const needsEscaping = /[",\r\n]/.test(value);
  if (!needsEscaping) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function resolveFacilityName(
  snapshot: TraceabilitySnapshot,
  facilityId: string | null | undefined,
): string {
  if (!facilityId) return "";
  const record = snapshot.facilityMap.get(facilityId);
  return record ? record.name : facilityId;
}

function formatIso(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toISOString();
  } catch {
    return value;
  }
}

export function buildTraceabilityCsv(snapshot: TraceabilitySnapshot): string {
  const lines: string[] = [];

  lines.push(`# pack-trace traceability export`);
  lines.push(`# Batch ID: ${snapshot.batch.id}`);
  lines.push(`# Product: ${snapshot.batch.product_name ?? "—"}`);
  lines.push(`# GTIN: ${snapshot.batch.gtin}`);
  lines.push(`# Lot: ${snapshot.batch.lot}`);
  lines.push(`# Expiry: ${snapshot.batch.expiry}`);
  lines.push(`# Generated: ${snapshot.generatedAt}`);
  lines.push(
    `# Facility chain: ${
      snapshot.facilityChain.length > 0
        ? snapshot.facilityChain
            .map((entry, index) => `${index + 1}. ${entry.name}`)
            .join(" -> ")
        : "Unavailable"
    }`,
  );

  if (snapshot.timeline.error) {
    lines.push(`# Timeline error: ${snapshot.timeline.error}`);
  } else if (snapshot.timeline.note) {
    lines.push(`# Timeline note: ${snapshot.timeline.note}`);
  }

  lines.push("");

  const headers = [
    "sequence_number",
    "consensus_timestamp",
    "consensus_timestamp_human",
    "event_type",
    "actor_facility_id",
    "actor_facility_name",
    "actor_role",
    "recipient_facility_id",
    "recipient_facility_name",
    "running_hash",
    "previous_hash",
    "payload_timestamp",
    "payload_meta",
    "batch_gtin",
    "batch_lot",
    "batch_expiry",
    "ledger_topic_id",
    "db_recorded_at",
    "db_hcs_transaction_id",
    "db_payload_hash",
  ];

  lines.push(headers.join(","));

  const eventBySequence = new Map<number, { recordedAt: string; txId: string; payloadHash: string }>();

  snapshot.events.forEach((event) => {
    if (typeof event.hcs_seq_no === "number") {
      eventBySequence.set(event.hcs_seq_no, {
        recordedAt: event.created_at,
        txId: event.hcs_tx_id ?? "",
        payloadHash: event.payload_hash,
      });
    }
  });

  snapshot.timelineEntries.forEach((entry) => {
    const matchingEvent = eventBySequence.get(entry.sequenceNumber);

    const row = [
      entry.sequenceNumber.toString(),
      entry.consensusTimestamp,
      formatConsensusTimestamp(entry.consensusTimestamp),
      entry.type,
      entry.actor.facilityId,
      resolveFacilityName(snapshot, entry.actor.facilityId),
      entry.actor.role,
      entry.to?.facilityId ?? "",
      resolveFacilityName(snapshot, entry.to?.facilityId ?? null),
      entry.runningHash,
      entry.prev ?? "",
      entry.ts,
      entry.meta ? JSON.stringify(entry.meta) : "",
      snapshot.batch.gtin,
      snapshot.batch.lot,
      snapshot.batch.expiry,
      snapshot.timeline.topicId ?? "",
      matchingEvent ? formatIso(matchingEvent.recordedAt) : "",
      matchingEvent?.txId ?? "",
      matchingEvent?.payloadHash ?? "",
    ];

    lines.push(row.map((value) => escapeCsvValue(value ?? "")).join(","));
  });

  if (snapshot.timeline.truncated) {
    lines.push("");
    lines.push(
      "# Warning: Timeline truncated due to query limits. Re-run with pagination to fetch additional entries.",
    );
  }

  return lines.join("\r\n");
}
