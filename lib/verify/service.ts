import type { SupabaseClient } from "@supabase/supabase-js";

import { parseGs1Datamatrix } from "@/lib/labels/gs1";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBatchTimeline } from "@/lib/hedera/timeline-service";
import { serverEnv } from "@/lib/env/server";
import type {
  VerifyBatch,
  VerifyFacility,
  VerifyState,
  VerifyStatus,
} from "@/lib/verify/types";

interface TimelineCacheEntry {
  expiresAt: number;
  result: Awaited<ReturnType<typeof loadBatchTimeline>>;
}

interface VerifyOptions {
  code: string | null | undefined;
  cursor?: string | null;
  limit?: number;
  adminClient?: SupabaseClient;
}

const TIMELINE_CACHE_TTL_MS = 45_000;
const timelineCache = new Map<string, TimelineCacheEntry>();

function buildStatusMessage(status: VerifyStatus, fallback?: string | null) {
  if (fallback) return fallback;

  switch (status) {
    case "genuine":
      return "This pack is authentic and present on the custody timeline.";
    case "recalled":
      return "This pack has an active recall notice. Quarantine immediately.";
    case "unknown":
      return "No custody record was found for the provided identifiers.";
    case "mismatch":
      return "The GTIN and lot match a custody record, but the expiry date differs.";
    case "error":
      return "Unable to verify the provided code.";
    case "idle":
    default:
      return "Scan a GS1 DataMatrix barcode or paste the encoded value to verify the pack.";
  }
}

function resolveTopicId(batch: VerifyBatch | null): string | null {
  if (batch?.topic_id) return batch.topic_id;
  return serverEnv.hederaTopicId ?? null;
}

export async function verifyCode(
  options: VerifyOptions,
): Promise<VerifyState> {
  const { code, cursor = null, limit = 10 } = options;
  const trimmedCode = typeof code === "string" ? code.trim() : null;
  const admin = options.adminClient ?? createAdminClient();

  let parsed = null;
  let parseError: string | null = null;
  let status: VerifyStatus = "idle";
  let message: string | null = null;

  if (trimmedCode) {
    try {
      parsed = parseGs1Datamatrix(trimmedCode);
      status = "unknown";
    } catch (error) {
      parseError = (error as Error).message;
      status = "error";
      message = parseError;
    }
  }

  let batch: VerifyBatch | null = null;

  if (parsed) {
    const batchResponse = await admin
      .from("batches")
      .select(
        `
        id,
        product_name,
        gtin,
        lot,
        expiry,
        qty,
        label_text,
        topic_id,
        current_owner_facility_id,
        pending_receipt_to_facility_id,
        last_handover_event_id,
        created_at,
        current_owner_facility:facilities!batches_current_owner_facility_id_fkey(
          id,
          name,
          type
        )
      `,
      )
      .eq("gtin", parsed.gtin14)
      .eq("lot", parsed.lot)
      .maybeSingle();

    if (batchResponse.error && batchResponse.error.code !== "PGRST116") {
      throw new Error(batchResponse.error.message);
    }

    const raw = (batchResponse.data as Record<string, unknown> | null) ?? null;

    if (raw) {
      const ownerRaw =
        (raw as { current_owner_facility?: unknown }).current_owner_facility ??
        null;
      let ownerFacility: VerifyFacility | null = null;

      if (Array.isArray(ownerRaw)) {
        const candidate = ownerRaw[0] as Record<string, unknown> | undefined;
        if (candidate) {
          ownerFacility = {
            id: String(candidate.id ?? ""),
            name: (candidate.name as string | null) ?? null,
            type: (candidate.type as string | null) ?? null,
          };
        }
      } else if (ownerRaw && typeof ownerRaw === "object") {
        const candidate = ownerRaw as Record<string, unknown>;
        ownerFacility = {
          id: String(candidate.id ?? ""),
          name: (candidate.name as string | null) ?? null,
          type: (candidate.type as string | null) ?? null,
        };
      }

      batch = {
        id: String(raw.id ?? ""),
        product_name: (raw.product_name as string | null) ?? null,
        gtin: String(raw.gtin ?? ""),
        lot: String(raw.lot ?? ""),
        expiry: String(raw.expiry ?? ""),
        qty: Number(raw.qty ?? 0),
        label_text: (raw.label_text as string | null) ?? null,
        topic_id: (raw.topic_id as string | null) ?? null,
        current_owner_facility_id:
          (raw.current_owner_facility_id as string | null) ?? null,
        current_owner_facility: ownerFacility,
        pending_receipt_to_facility_id:
          (raw.pending_receipt_to_facility_id as string | null) ?? null,
        last_handover_event_id:
          (raw.last_handover_event_id as string | null) ?? null,
        created_at: String(raw.created_at ?? ""),
      };
    }

    if (!batch) {
      status = "unknown";
      message = buildStatusMessage(status);
    } else if (batch.expiry !== parsed.expiryIsoDate) {
      status = "mismatch";
      message = buildStatusMessage(
        status,
        "Expiry does not match the custody record. Confirm the label and contact support.",
      );
    } else {
      status = "genuine";
      message = buildStatusMessage(status);
    }
  } else if (!parseError) {
    status = "idle";
    message = buildStatusMessage(status);
  }

  const topicId = resolveTopicId(batch);

  let timelineEntries: VerifyState["timelineEntries"] = [];
  let timelineNote: string | null = null;
  let timelineError: string | null = null;
  let nextCursor: string | null = null;

  if (batch && parsed && topicId) {
    const identifiers = {
      gtin: batch.gtin,
      lot: batch.lot,
      expiry: batch.expiry,
    };

    const cacheKey =
      cursor === null
        ? `${topicId}:${identifiers.gtin}:${identifiers.lot}:${identifiers.expiry}:${limit}`
        : null;

    let timelineResult: Awaited<ReturnType<typeof loadBatchTimeline>>;

    if (cacheKey) {
      const cached = timelineCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        timelineResult = cached.result;
      } else {
        timelineResult = await loadBatchTimeline({
          topicId,
          identifiers,
          cursor,
          limit,
        });
        timelineCache.set(cacheKey, {
          result: timelineResult,
          expiresAt: Date.now() + TIMELINE_CACHE_TTL_MS,
        });
      }
    } else {
      timelineResult = await loadBatchTimeline({
        topicId,
        identifiers,
        cursor,
        limit,
      });
    }

    timelineEntries = timelineResult.entries;
    timelineNote = timelineResult.note;
    timelineError = timelineResult.error;
    nextCursor = timelineResult.nextCursor;
  } else if (batch && !topicId) {
    timelineError =
      "This batch is not linked to a Hedera topic. Request support to publish custody events.";
  }

  if (!message) {
    message = buildStatusMessage(status);
  }

  const hasRecall = timelineEntries.some((entry) => entry.type === "RECALLED");

  if (hasRecall && status !== "error" && status !== "idle") {
    status = "recalled";
    message = buildStatusMessage(status);
  }

  const facilityIds = new Set<string>();

  if (batch?.current_owner_facility_id) {
    facilityIds.add(batch.current_owner_facility_id);
  }

  for (const entry of timelineEntries) {
    if (entry.actor?.facilityId) {
      facilityIds.add(entry.actor.facilityId);
    }
    if (entry.to?.facilityId) {
      facilityIds.add(entry.to.facilityId);
    }
  }

  const facilities: Record<string, VerifyFacility> = {};

  if (facilityIds.size > 0) {
    const facilityResponse = await admin
      .from("facilities")
      .select("id, name, type")
      .in("id", Array.from(facilityIds));

    if (facilityResponse.error && facilityResponse.error.code !== "PGRST116") {
      throw new Error(facilityResponse.error.message);
    }

    for (const record of (facilityResponse.data as
      | Array<Record<string, unknown>>
      | null
      | undefined) ?? []) {
      const id = String(record.id ?? "");
      facilities[id] = {
        id,
        name: (record.name as string | null) ?? null,
        type: (record.type as string | null) ?? null,
      };
    }
  }

  if (batch && !batch.current_owner_facility && batch.current_owner_facility_id) {
    batch.current_owner_facility =
      facilities[batch.current_owner_facility_id] ?? null;
  }

  return {
    code: trimmedCode,
    parsed,
    parseError,
    status,
    message,
    batch,
    timelineEntries,
    timelineNote,
    timelineError,
    nextCursor,
    topicId,
    facilities,
  };
}
