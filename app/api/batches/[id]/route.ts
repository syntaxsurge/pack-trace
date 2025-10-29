import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const resolvedParams = await context.params;
  const paramsParse = paramsSchema.safeParse(resolvedParams);

  if (!paramsParse.success) {
    return NextResponse.json(
      { error: "Invalid batch identifier." },
      { status: 400 },
    );
  }

  const batchId = paramsParse.data.id;

  const batchResponse = await supabase
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
        created_at,
        created_by_user_id,
        current_owner:facilities!batches_current_owner_facility_id_fkey(
          id,
          name,
          type,
          country,
          gs1_company_prefix
        )
      `,
    )
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

  const eventsResponse = await supabase
    .from("events")
    .select(
      "id, type, created_at, from_facility_id, to_facility_id, hcs_tx_id, hcs_seq_no, hcs_running_hash, payload_hash",
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventsResponse.error && eventsResponse.error.code !== "PGRST116") {
    return NextResponse.json(
      { error: eventsResponse.error.message },
      { status: 400 },
    );
  }

  const facilityIds = new Set<string>();

  if (batch.current_owner_facility_id) {
    facilityIds.add(batch.current_owner_facility_id);
  }

  const events = eventsResponse.data ?? [];

  for (const event of events) {
    if (event.from_facility_id) facilityIds.add(event.from_facility_id);
    if (event.to_facility_id) facilityIds.add(event.to_facility_id);
  }

  const facilityLookup: Record<string, unknown> = {};

  if (facilityIds.size > 0) {
    const facilitiesResponse = await supabase
      .from("facilities")
      .select("id, name, type, country, gs1_company_prefix")
      .in("id", Array.from(facilityIds));

    if (facilitiesResponse.error && facilitiesResponse.error.code !== "PGRST116") {
      return NextResponse.json(
        { error: facilitiesResponse.error.message },
        { status: 400 },
      );
    }

    for (const facility of facilitiesResponse.data ?? []) {
      facilityLookup[facility.id as string] = facility;
    }
  }

  return NextResponse.json({
    batch,
    events,
    facilities: facilityLookup,
  });
}
