import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import {
  loadCompleteBatchTimeline,
  type LoadCompleteBatchTimelineResult,
} from "@/lib/hedera/timeline-service";
import type { CustodyTimelineEntry } from "@/lib/hedera/timeline";

export class TraceabilityReportError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "TraceabilityReportError";
    this.status = status;
  }
}

export interface BatchRecord {
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

export interface EventRecord {
  id: string;
  type: string;
  created_at: string;
  hcs_seq_no: number | null;
  hcs_tx_id: string | null;
  hcs_running_hash: string | null;
  payload_hash: string;
  from_facility_id: string | null;
  to_facility_id: string | null;
}

export interface FacilityRecord {
  id: string;
  name: string;
  type: string;
  country: string | null;
  gs1_company_prefix: string | null;
}

export interface FacilityChainEntry {
  facilityId: string;
  name: string;
  type: string | null;
  role: string | null;
  firstSequenceNumber: number | null;
  firstConsensusTimestamp: string | null;
}

export interface TraceabilitySnapshot {
  batch: BatchRecord;
  events: EventRecord[];
  timelineEntries: CustodyTimelineEntry[];
  facilityMap: Map<string, FacilityRecord>;
  facilityChain: FacilityChainEntry[];
  timeline: {
    topicId: string | null;
    truncated: boolean;
    note: string | null;
    error: string | null;
  };
  generatedAt: string;
}

const TIMELINE_EMPTY_NOTE =
  "No Hedera messages were found for these identifiers in the configured topic.";

function coerceExpiryToIso(value: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toISOString().slice(0, 10);
  } catch {
    return value;
  }
}

function buildFacilityChain(
  entries: CustodyTimelineEntry[],
  facilityMap: Map<string, FacilityRecord>,
): FacilityChainEntry[] {
  const chainLookup = new Map<string, FacilityChainEntry>();

  const register = (
    facilityId: string,
    sequenceNumber: number,
    consensusTimestamp: string,
    role: string | null,
  ) => {
    if (!facilityId) return;
    if (chainLookup.has(facilityId)) return;

    const facility = facilityMap.get(facilityId) ?? null;
    chainLookup.set(facilityId, {
      facilityId,
      name: facility?.name ?? facilityId,
      type: facility?.type ?? null,
      role,
      firstSequenceNumber: sequenceNumber ?? null,
      firstConsensusTimestamp: consensusTimestamp ?? null,
    });
  };

  for (const entry of entries) {
    register(entry.actor.facilityId, entry.sequenceNumber, entry.consensusTimestamp, entry.actor.role ?? null);
    if (entry.to?.facilityId) {
      register(entry.to.facilityId, entry.sequenceNumber, entry.consensusTimestamp, null);
    }
  }

  return Array.from(chainLookup.values()).sort((a, b) => {
    const seqA = a.firstSequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.firstSequenceNumber ?? Number.MAX_SAFE_INTEGER;

    if (seqA === seqB) {
      return (a.firstConsensusTimestamp ?? "").localeCompare(
        b.firstConsensusTimestamp ?? "",
      );
    }

    return seqA - seqB;
  });
}

function summariseTimelineResult(
  result: LoadCompleteBatchTimelineResult,
  identifiers: { gtin: string; lot: string; expiry: string },
): { entries: CustodyTimelineEntry[]; note: string | null } {
  if (result.error) {
    return { entries: [], note: null };
  }

  if (result.entries.length === 0) {
    return { entries: [], note: TIMELINE_EMPTY_NOTE };
  }

  const sorted = [...result.entries].sort((a, b) => {
    if (a.sequenceNumber === b.sequenceNumber) {
      return a.consensusTimestamp.localeCompare(b.consensusTimestamp);
    }

    return a.sequenceNumber - b.sequenceNumber;
  });

  if (!result.truncated) {
    return { entries: sorted, note: null };
  }

  const message = `Timeline truncated after ${sorted.length} matched entries for GTIN ${identifiers.gtin}, lot ${identifiers.lot}, expiry ${identifiers.expiry}. Request a narrower range or paginate via the API route for complete coverage.`;

  return { entries: sorted, note: message };
}

export async function loadTraceabilitySnapshot(
  batchId: string,
  supabase: SupabaseClient,
  admin: SupabaseClient,
): Promise<TraceabilitySnapshot> {
  const batchResponse = await supabase
    .from("batches")
    .select(
      "id, product_name, gtin, lot, expiry, qty, label_text, current_owner_facility_id, topic_id, created_at",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (batchResponse.error && batchResponse.error.code !== "PGRST116") {
    throw new TraceabilityReportError(batchResponse.error.message, 400);
  }

  const batch = (batchResponse.data as BatchRecord | null) ?? null;

  if (!batch) {
    throw new TraceabilityReportError(
      "Batch not found or access is restricted.",
      404,
    );
  }

  const eventsResponse = await supabase
    .from("events")
    .select(
      "id, type, created_at, hcs_seq_no, hcs_tx_id, hcs_running_hash, payload_hash, from_facility_id, to_facility_id",
    )
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });

  if (eventsResponse.error && eventsResponse.error.code !== "PGRST116") {
    throw new TraceabilityReportError(eventsResponse.error.message, 400);
  }

  const events =
    (eventsResponse.data as EventRecord[] | null)?.slice() ?? [];

  const facilityIds = new Set<string>();

  if (batch.current_owner_facility_id) {
    facilityIds.add(batch.current_owner_facility_id);
  }

  for (const event of events) {
    if (event.from_facility_id) facilityIds.add(event.from_facility_id);
    if (event.to_facility_id) facilityIds.add(event.to_facility_id);
  }

  let timelineResult: LoadCompleteBatchTimelineResult | null = null;
  let topicId: string | null = batch.topic_id ?? serverEnv.hederaTopicId;

  if (topicId) {
    timelineResult = await loadCompleteBatchTimeline({
      topicId,
      identifiers: {
        gtin: batch.gtin,
        lot: batch.lot,
        expiry: coerceExpiryToIso(batch.expiry),
      },
      pageSize: 150,
      maxPages: 20,
      order: "asc",
    });

    if (timelineResult.entries.length > 0) {
      for (const entry of timelineResult.entries) {
        if (entry.actor.facilityId) {
          facilityIds.add(entry.actor.facilityId);
        }
        if (entry.to?.facilityId) {
          facilityIds.add(entry.to.facilityId);
        }
      }
    }
  }

  const facilities = new Map<string, FacilityRecord>();

  if (facilityIds.size > 0) {
    const facilityResponse = await admin
      .from("facilities")
      .select("id, name, type, country, gs1_company_prefix")
      .in("id", Array.from(facilityIds));

    if (facilityResponse.error && facilityResponse.error.code !== "PGRST116") {
      throw new TraceabilityReportError(facilityResponse.error.message, 400);
    }

    for (const record of facilityResponse.data ?? []) {
      const facility = record as FacilityRecord;
      facilities.set(facility.id, facility);
    }
  }

  const timelineSummary = timelineResult
    ? summariseTimelineResult(timelineResult, {
        gtin: batch.gtin,
        lot: batch.lot,
        expiry: coerceExpiryToIso(batch.expiry),
      })
    : { entries: [] as CustodyTimelineEntry[], note: null };

  const facilityChain = buildFacilityChain(
    timelineSummary.entries,
    facilities,
  );

  return {
    batch: {
      ...batch,
      expiry: coerceExpiryToIso(batch.expiry),
    },
    events,
    timelineEntries: timelineSummary.entries,
    facilityMap: facilities,
    facilityChain,
    timeline: {
      topicId,
      truncated: Boolean(timelineResult?.truncated),
      note: timelineSummary.note,
      error:
        timelineResult?.error ??
        (topicId ? null : "No Hedera topic configured for this batch."),
    },
    generatedAt: new Date().toISOString(),
  };
}
