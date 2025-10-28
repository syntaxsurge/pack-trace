import type { SupabaseClient } from "@supabase/supabase-js";

import { parseGs1Datamatrix } from "@/lib/labels/gs1";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBatchTimeline } from "@/lib/hedera/timeline-service";
import { serverEnv } from "@/lib/env/server";
import type { VerifyBatch, VerifyState, VerifyStatus } from "@/lib/verify/types";

interface VerifyOptions {
  code: string | null | undefined;
  cursor?: string | null;
  limit?: number;
  adminClient?: SupabaseClient;
}

function buildStatusMessage(status: VerifyStatus, fallback?: string | null) {
  if (fallback) return fallback;

  switch (status) {
    case "genuine":
      return "This pack is authentic and present on the custody timeline.";
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
        "id, product_name, gtin, lot, expiry, qty, label_text, topic_id, current_owner_facility_id, created_at",
      )
      .eq("gtin", parsed.gtin14)
      .eq("lot", parsed.lot)
      .maybeSingle();

    if (batchResponse.error && batchResponse.error.code !== "PGRST116") {
      throw new Error(batchResponse.error.message);
    }

    batch = (batchResponse.data as VerifyBatch | null) ?? null;

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

    const timeline = await loadBatchTimeline({
      topicId,
      identifiers,
      cursor,
      limit,
    });

    timelineEntries = timeline.entries;
    timelineNote = timeline.note;
    timelineError = timeline.error;
    nextCursor = timeline.nextCursor;
  } else if (batch && !topicId) {
    timelineError =
      "This batch is not linked to a Hedera topic. Request support to publish custody events.";
  }

  if (!message) {
    message = buildStatusMessage(status);
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
  };
}
