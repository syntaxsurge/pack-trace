import { NextResponse } from "next/server";
import { z } from "zod";

import { publishCustodyEvent } from "@/lib/hedera/publisher";
import { sha256 } from "@/lib/hedera/hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CustodyEventType } from "@/lib/hedera/types";

const requestSchema = z.object({
  batchId: z.string().uuid().optional(),
  gs1: z
    .object({
      gtin: z.string().regex(/^\d{14}$/),
      lot: z.string().min(1).max(20),
      expiryIsoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
  type: z.enum(["MANUFACTURED", "RECEIVED", "HANDOVER", "DISPENSED", "RECALLED"]),
  toFacilityId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

interface BatchRecord {
  id: string;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  topic_id: string | null;
  current_owner_facility_id: string | null;
}

function isCustodyEventType(value: string): value is CustodyEventType {
  return ["MANUFACTURED", "RECEIVED", "HANDOVER", "DISPENSED", "RECALLED"].includes(
    value,
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (!input.batchId && !input.gs1) {
    return NextResponse.json(
      { error: "Provide either a batchId or GS1 payload to resolve the batch." },
      { status: 400 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const profileResponse = await supabase
    .from("users")
    .select("role, facility_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    return NextResponse.json(
      { error: profileResponse.error.message },
      { status: 400 },
    );
  }

  const profile = profileResponse.data ?? { role: "UNKNOWN", facility_id: null };
  const actorFacilityId = profile.facility_id as string | null;
  const eventType = input.type;

  if (!isCustodyEventType(eventType)) {
    return NextResponse.json({ error: "Unsupported event type." }, { status: 400 });
  }

  let batch: BatchRecord | null = null;

  if (input.batchId) {
    const { data, error } = await admin
      .from("batches")
      .select(
        "id, gtin, lot, expiry, qty, topic_id, current_owner_facility_id",
      )
      .eq("id", input.batchId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data) {
      batch = data as BatchRecord;
    }
  }

  if (!batch && input.gs1) {
    const { data, error } = await admin
      .from("batches")
      .select(
        "id, gtin, lot, expiry, qty, topic_id, current_owner_facility_id",
      )
      .eq("gtin", input.gs1.gtin)
      .eq("lot", input.gs1.lot)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data) {
      batch = data as BatchRecord;
    }
  }

  if (!batch) {
    return NextResponse.json(
      { error: "Batch not found for the provided identifiers." },
      { status: 404 },
    );
  }

  if (input.gs1 && batch.expiry !== input.gs1.expiryIsoDate) {
    return NextResponse.json(
      {
        error:
          "Expiry mismatch between scanned payload and stored batch metadata.",
      },
      { status: 409 },
    );
  }

  const isAuditor = profile.role === "AUDITOR";

  if (!actorFacilityId) {
    return NextResponse.json(
      {
        error:
          "Assign this user to a facility before recording custody events.",
      },
      { status: 400 },
    );
  }

  let fromFacilityId: string | null = null;
  let toFacilityId: string | null = null;
  let nextOwnerFacilityId: string | null = batch.current_owner_facility_id;

  if (eventType === "RECEIVED") {
    if (!actorFacilityId) {
      return NextResponse.json(
        { error: "Receiving facility must be assigned to the user." },
        { status: 400 },
      );
    }
    fromFacilityId = batch.current_owner_facility_id;
    toFacilityId = actorFacilityId;
    nextOwnerFacilityId = actorFacilityId;
  } else if (eventType === "HANDOVER") {
    if (!input.toFacilityId) {
      return NextResponse.json(
        { error: "toFacilityId is required for handover events." },
        { status: 400 },
      );
    }

    const { data: destination, error: destinationError } = await admin
      .from("facilities")
      .select("id")
      .eq("id", input.toFacilityId)
      .maybeSingle();

    if (destinationError) {
      return NextResponse.json(
        { error: destinationError.message },
        { status: 400 },
      );
    }

    if (!destination) {
      return NextResponse.json(
        { error: "Destination facility does not exist." },
        { status: 400 },
      );
    }

    if (!isAuditor && actorFacilityId !== batch.current_owner_facility_id) {
      return NextResponse.json(
        {
          error:
            "Only the current owner facility or an auditor can initiate a handover.",
        },
        { status: 403 },
      );
    }

    fromFacilityId = actorFacilityId;
    toFacilityId = input.toFacilityId;
    nextOwnerFacilityId = input.toFacilityId;
  } else if (eventType === "DISPENSED") {
    if (!actorFacilityId) {
      return NextResponse.json(
        { error: "Dispense actions require an assigned facility." },
        { status: 400 },
      );
    }

    if (!isAuditor && actorFacilityId !== batch.current_owner_facility_id) {
      return NextResponse.json(
        {
          error:
            "Only the current owner facility or an auditor can dispense a batch.",
        },
        { status: 403 },
      );
    }

    fromFacilityId = actorFacilityId;
    toFacilityId = null;
    nextOwnerFacilityId = actorFacilityId;
  } else if (eventType === "MANUFACTURED") {
    if (!actorFacilityId) {
      return NextResponse.json(
        { error: "Manufacturing events require an assigned facility." },
        { status: 400 },
      );
    }

    fromFacilityId = actorFacilityId;
    toFacilityId = null;
    nextOwnerFacilityId = actorFacilityId;
  } else if (eventType === "RECALLED") {
    fromFacilityId = actorFacilityId;
    toFacilityId = null;
    nextOwnerFacilityId = actorFacilityId;
  }

  const previousEventResponse = await admin
    .from("events")
    .select("payload_hash")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousPayloadHash =
    previousEventResponse.data?.payload_hash ?? null;

  const payload = {
    v: 1,
    type: eventType,
    batch: {
      gtin: batch.gtin,
      lot: batch.lot,
      exp: batch.expiry,
    },
    actor: {
      facilityId: actorFacilityId,
      role: profile.role,
    },
    to: toFacilityId ? { facilityId: toFacilityId } : undefined,
    ts: new Date().toISOString(),
    prev: previousPayloadHash ? `sha256:${previousPayloadHash}` : undefined,
    meta: input.metadata,
  };

  let hederaDelivered = false;
  let transactionId: string;
  let sequenceNumber: number | null = null;
  let runningHash: string | null = null;
  let payloadHash: string;

  try {
    const result = await publishCustodyEvent({
      payload,
      topicId: batch.topic_id ?? undefined,
      transactionMemo: `batch:${batch.id}:${eventType}`,
    });

    hederaDelivered = true;
    transactionId = result.transactionId;
    sequenceNumber = result.sequenceNumber;
    runningHash = result.runningHash;
    payloadHash = result.payloadHash;
  } catch (hederaError) {
    transactionId = `LOCAL-${crypto.randomUUID()}`;
    payloadHash = sha256(payload);
    sequenceNumber = null;
    runningHash = null;

    console.warn(
      "[events] Falling back to local ledger persistence:",
      hederaError instanceof Error ? hederaError.message : hederaError,
    );
  }

  const insertResponse = await supabase
    .from("events")
    .insert({
      batch_id: batch.id,
      type: eventType,
      from_facility_id: fromFacilityId,
      to_facility_id: toFacilityId,
      hcs_tx_id: transactionId,
      hcs_seq_no: sequenceNumber,
      hcs_running_hash: runningHash,
      payload_hash: payloadHash,
      created_by_user_id: user.id,
    })
    .select("id, hcs_tx_id, hcs_seq_no, hcs_running_hash, payload_hash")
    .maybeSingle();

  if (insertResponse.error) {
    return NextResponse.json(
      { error: insertResponse.error.message },
      { status: 400 },
    );
  }

  let updateWarning: string | null = null;

  if (nextOwnerFacilityId !== batch.current_owner_facility_id) {
    const { error: updateError } = await admin
      .from("batches")
      .update({ current_owner_facility_id: nextOwnerFacilityId })
      .eq("id", batch.id);

    if (updateError) {
      updateWarning = updateError.message;
    }
  }

  return NextResponse.json(
    {
      event: insertResponse.data,
      hederaDelivered,
      warning: updateWarning,
    },
    { status: 201 },
  );
}
