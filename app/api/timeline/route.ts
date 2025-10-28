import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { loadBatchTimeline } from "@/lib/hedera/timeline-service";
import { serverEnv } from "@/lib/env/server";

const querySchema = z.object({
  batchId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const queryParse = querySchema.safeParse(rawQuery);

  if (!queryParse.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: queryParse.error.flatten() },
      { status: 400 },
    );
  }

  const { batchId, cursor, limit = 25, order = "desc" } = queryParse.data;

  const batchResponse = await supabase
    .from("batches")
    .select("id, gtin, lot, expiry, topic_id")
    .eq("id", batchId)
    .maybeSingle();

  if (batchResponse.error && batchResponse.error.code !== "PGRST116") {
    return NextResponse.json(
      { error: batchResponse.error.message },
      { status: 400 },
    );
  }

  const batch = batchResponse.data;

  if (!batch) {
    return NextResponse.json(
      { error: "Batch not found or access denied." },
      { status: 404 },
    );
  }

  const topicId: string | null = batch.topic_id ?? serverEnv.hederaTopicId ?? null;

  const eventsResponse = await supabase
    .from("events")
    .select(
      "id, type, created_at, hcs_seq_no, hcs_tx_id, hcs_running_hash, from_facility_id, to_facility_id",
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: order === "asc" });

  if (eventsResponse.error && eventsResponse.error.code !== "PGRST116") {
    return NextResponse.json(
      { error: eventsResponse.error.message },
      { status: 400 },
    );
  }

  if (!topicId) {
    return NextResponse.json({
      batch,
      events: eventsResponse.data ?? [],
      timeline: {
        entries: [],
        nextCursor: null,
        note:
          "This batch is not linked to a Hedera topic. Request support to publish custody events.",
        error: null,
      },
    });
  }

  const timeline = await loadBatchTimeline({
    topicId,
    identifiers: {
      gtin: batch.gtin,
      lot: batch.lot,
      expiry: batch.expiry,
    },
    cursor: cursor ?? null,
    limit,
    order,
  });

  return NextResponse.json({
    batch: {
      id: batch.id,
      gtin: batch.gtin,
      lot: batch.lot,
      expiry: batch.expiry,
      topic_id: topicId,
    },
    events: eventsResponse.data ?? [],
    timeline,
  });
}
