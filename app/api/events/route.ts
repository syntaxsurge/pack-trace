import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { publishCustodyEvent } from "@/lib/hedera/publisher";
import { sha256 } from "@/lib/hedera/hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CustodyEventType } from "@/lib/hedera/types";

const IDEMPOTENCY_HEADER = "x-idempotency-key";

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
  pending_receipt_to_facility_id: string | null;
  last_handover_event_id: string | null;
}

interface UserProfile {
  role: string;
  facility_id: string | null;
  facility?: {
    id: string;
    type: string | null;
  } | null;
}

interface EventRecord {
  id: string;
  hcs_tx_id: string;
  hcs_seq_no: number | null;
  hcs_running_hash: string | null;
  payload_hash: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

function isCustodyEventType(value: string): value is CustodyEventType {
  return ["MANUFACTURED", "RECEIVED", "HANDOVER", "DISPENSED", "RECALLED"].includes(
    value,
  );
}

function normalizeIdempotencyKey(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function loadEventById(admin: AdminClient, eventId: string) {
  const response = await admin
    .from("events")
    .select("id, hcs_tx_id, hcs_seq_no, hcs_running_hash, payload_hash")
    .eq("id", eventId)
    .maybeSingle();

  if (response.error && response.error.code !== "PGRST116") {
    throw new Error(response.error.message);
  }

  return (response.data as EventRecord | null) ?? null;
}

async function fetchDestinationFacility(admin: AdminClient, facilityId: string) {
  const response = await admin
    .from("facilities")
    .select("id")
    .eq("id", facilityId)
    .maybeSingle();

  if (response.error && response.error.code !== "PGRST116") {
    throw new Error(response.error.message);
  }

  return response.data ?? null;
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
    .select(
      `
        role,
        facility_id,
        facility:facilities!users_facility_id_fkey (
          id,
          type
        )
      `,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    return NextResponse.json(
      { error: profileResponse.error.message },
      { status: 400 },
    );
  }

  const profile = (profileResponse.data as UserProfile | null) ?? {
    role: "UNKNOWN",
    facility_id: null,
  };

  const actorFacilityId = profile.facility_id ?? null;
  const actorFacilityType = profile.facility?.type ?? null;
  const isAuditor = profile.role === "AUDITOR";
  const eventType = input.type;

  if (!isCustodyEventType(eventType)) {
    return NextResponse.json({ error: "Unsupported event type." }, { status: 400 });
  }

  const idempotencyKey = normalizeIdempotencyKey(
    request.headers.get(IDEMPOTENCY_HEADER),
  );
  let idempotencyKeyCreated = false;

  async function cleanupIdempotencyKey() {
    if (idempotencyKey && idempotencyKeyCreated) {
      await admin.from("idempotency_keys").delete().eq("key", idempotencyKey);
      idempotencyKeyCreated = false;
    }
  }

  if (idempotencyKey) {
    const existingKey = await admin
      .from("idempotency_keys")
      .select("event_id")
      .eq("key", idempotencyKey)
      .maybeSingle();

    if (existingKey.error && existingKey.error.code !== "PGRST116") {
      return NextResponse.json({ error: existingKey.error.message }, { status: 400 });
    }

    if (existingKey.data) {
      const existingEventId = existingKey.data.event_id as string | null;

      if (existingEventId) {
        const existingEvent = await loadEventById(admin, existingEventId);

        if (existingEvent) {
          return NextResponse.json(
            {
              event: existingEvent,
              hederaDelivered: existingEvent.hcs_seq_no !== null,
              idempotent: true,
            },
            { status: 200 },
          );
        }
      }

      return NextResponse.json(
        {
          error:
            "Duplicate request detected. Wait for the original request to finish or retry with a new idempotency key.",
        },
        { status: 409 },
      );
    }

    const insertKey = await admin
      .from("idempotency_keys")
      .insert({ key: idempotencyKey })
      .select("key")
      .maybeSingle();

    if (insertKey.error) {
      if (insertKey.error.code === "23505") {
        const existing = await admin
          .from("idempotency_keys")
          .select("event_id")
          .eq("key", idempotencyKey)
          .maybeSingle();

        if (existing.data?.event_id) {
          const existingEvent = await loadEventById(
            admin,
            existing.data.event_id as string,
          );

          if (existingEvent) {
            return NextResponse.json(
              {
                event: existingEvent,
                hederaDelivered: existingEvent.hcs_seq_no !== null,
                idempotent: true,
              },
              { status: 200 },
            );
          }
        }

        return NextResponse.json(
          {
            error:
              "Duplicate request detected. Wait for the original request to finish or retry with a new idempotency key.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: insertKey.error.message }, { status: 400 });
    }

    idempotencyKeyCreated = true;
  }

  if (!actorFacilityId && !isAuditor) {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      { error: "Assign this user to a facility before recording custody events." },
      { status: 400 },
    );
  }

  let batch: BatchRecord | null = null;

  if (input.batchId) {
    const { data, error } = await admin
      .from("batches")
      .select(
        "id, gtin, lot, expiry, qty, topic_id, current_owner_facility_id, pending_receipt_to_facility_id, last_handover_event_id",
      )
      .eq("id", input.batchId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      await cleanupIdempotencyKey();
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
        "id, gtin, lot, expiry, qty, topic_id, current_owner_facility_id, pending_receipt_to_facility_id, last_handover_event_id",
      )
      .eq("gtin", input.gs1.gtin)
      .eq("lot", input.gs1.lot)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      await cleanupIdempotencyKey();
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data) {
      batch = data as BatchRecord;
    }
  }

  if (!batch) {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      { error: "Batch not found for the provided identifiers." },
      { status: 404 },
    );
  }

  if (input.gs1 && batch.expiry !== input.gs1.expiryIsoDate) {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      {
        error:
          "Expiry mismatch between scanned payload and stored batch metadata.",
      },
      { status: 409 },
    );
  }

  const terminalEventResponse = await admin
    .from("events")
    .select("type")
    .eq("batch_id", batch.id)
    .in("type", ["DISPENSED", "RECALLED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (terminalEventResponse.error && terminalEventResponse.error.code !== "PGRST116") {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      { error: terminalEventResponse.error.message },
      { status: 400 },
    );
  }

  if (terminalEventResponse.data?.type) {
    const terminalType = terminalEventResponse.data.type;
    await cleanupIdempotencyKey();
    return NextResponse.json(
      {
        error:
          terminalType === "DISPENSED"
            ? "This pack was already dispensed."
            : `Batch events are locked after ${terminalType.toLowerCase()}.`,
      },
      { status: 409 },
    );
  }

  let fromFacilityId: string | null = null;
  let toFacilityId: string | null = null;
  let handoverEventId: string | null = null;
  let nextOwnerFacilityId: string | null = batch.current_owner_facility_id;
  let nextPendingReceiptFacilityId: string | null = batch.pending_receipt_to_facility_id;
  let previousPayloadHash: string | null = null;

  if (eventType === "MANUFACTURED") {
    if (!isAuditor && actorFacilityId !== batch.current_owner_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only the current owner facility or an auditor can log manufacturing." },
        { status: 403 },
      );
    }

    fromFacilityId = actorFacilityId;
    toFacilityId = null;
  } else if (eventType === "HANDOVER") {
    if (batch.pending_receipt_to_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Awaiting receipt for the previous handover before starting another." },
        { status: 409 },
      );
    }

    if (!input.toFacilityId) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "toFacilityId is required for handover events." },
        { status: 400 },
      );
    }

    if (!isAuditor && actorFacilityId !== batch.current_owner_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only the current owner facility or an auditor can initiate a handover." },
        { status: 403 },
      );
    }

    if (batch.current_owner_facility_id === input.toFacilityId) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Handover destination must be different from the origin." },
        { status: 400 },
      );
    }

    try {
      const destination = await fetchDestinationFacility(admin, input.toFacilityId);
      if (!destination) {
        await cleanupIdempotencyKey();
        return NextResponse.json(
          { error: "Destination facility does not exist." },
          { status: 400 },
        );
      }
    } catch (error) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify the destination facility.",
        },
        { status: 400 },
      );
    }

    fromFacilityId = batch.current_owner_facility_id;
    toFacilityId = input.toFacilityId;
    nextPendingReceiptFacilityId = input.toFacilityId;
  } else if (eventType === "RECEIVED") {
    if (!batch.pending_receipt_to_facility_id || !batch.last_handover_event_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "No pending handover to confirm for this batch." },
        { status: 409 },
      );
    }

    if (
      !isAuditor &&
      batch.pending_receipt_to_facility_id !== actorFacilityId
    ) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only the pending recipient facility or an auditor can confirm receipt." },
        { status: 403 },
      );
    }

    const receiptFacilityId = batch.pending_receipt_to_facility_id as string;

    const handoverEventResponse = await admin
      .from("events")
      .select("id, type, payload_hash, to_facility_id, from_facility_id")
      .eq("id", batch.last_handover_event_id)
      .maybeSingle();

    if (
      handoverEventResponse.error &&
      handoverEventResponse.error.code !== "PGRST116"
    ) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: handoverEventResponse.error.message },
        { status: 400 },
      );
    }

    const handoverEvent = handoverEventResponse.data;

    if (!handoverEvent || handoverEvent.type !== "HANDOVER") {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "The pending handover reference is invalid." },
        { status: 409 },
      );
    }

    if (!isAuditor && handoverEvent.to_facility_id !== actorFacilityId) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only the pending recipient facility can confirm this receipt." },
        { status: 403 },
      );
    }

    handoverEventId = handoverEvent.id as string;
    previousPayloadHash = (handoverEvent.payload_hash as string | null) ?? null;
    fromFacilityId = (handoverEvent.from_facility_id as string | null) ?? batch.current_owner_facility_id;
    toFacilityId = receiptFacilityId;
    nextOwnerFacilityId = receiptFacilityId;
    nextPendingReceiptFacilityId = null;
  } else if (eventType === "DISPENSED") {
    if (batch.pending_receipt_to_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Confirm outstanding handovers before dispensing this batch." },
        { status: 409 },
      );
    }

    if (!isAuditor && actorFacilityId !== batch.current_owner_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only the current owner facility or an auditor can dispense a batch." },
        { status: 403 },
      );
    }

    if (!isAuditor && actorFacilityType !== "PHARMACY") {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only pharmacy facilities can dispense packs." },
        { status: 403 },
      );
    }

    fromFacilityId = actorFacilityId ?? batch.current_owner_facility_id;
    toFacilityId = null;
    nextOwnerFacilityId = null;
    nextPendingReceiptFacilityId = null;
  } else if (eventType === "RECALLED") {
    if (!isAuditor) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Only auditors may record recall events." },
        { status: 403 },
      );
    }

    if (batch.pending_receipt_to_facility_id) {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: "Resolve the outstanding handover before recording a recall." },
        { status: 409 },
      );
    }

    fromFacilityId = batch.current_owner_facility_id;
    toFacilityId = null;
  }

  if (!previousPayloadHash) {
    const previousEventResponse = await admin
      .from("events")
      .select("payload_hash")
      .eq("batch_id", batch.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousEventResponse.error && previousEventResponse.error.code !== "PGRST116") {
      await cleanupIdempotencyKey();
      return NextResponse.json(
        { error: previousEventResponse.error.message },
        { status: 400 },
      );
    }

    previousPayloadHash =
      (previousEventResponse.data?.payload_hash as string | null) ?? null;
  }

  const eventId = randomUUID();
  const actingFacilityForPayload =
    actorFacilityId ??
    fromFacilityId ??
    toFacilityId ??
    batch.current_owner_facility_id ??
    batch.pending_receipt_to_facility_id;

  if (!actingFacilityForPayload) {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      { error: "Unable to resolve the acting facility for this event." },
      { status: 400 },
    );
  }

  const payload = {
    v: 1,
    type: eventType,
    batch: {
      gtin: batch.gtin,
      lot: batch.lot,
      exp: batch.expiry,
    },
    actor: {
      facilityId: actingFacilityForPayload,
      role: profile.role,
    },
    to: toFacilityId
      ? {
          facilityId: toFacilityId,
        }
      : undefined,
    ts: new Date().toISOString(),
    prev: previousPayloadHash ? `sha256:${previousPayloadHash}` : undefined,
    meta: {
      ...input.metadata,
      handoverEventId,
    },
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
    transactionId = `LOCAL-${randomUUID()}`;
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
      id: eventId,
      batch_id: batch.id,
      type: eventType,
      from_facility_id: fromFacilityId,
      to_facility_id: toFacilityId,
      handover_event_id: handoverEventId,
      hcs_tx_id: transactionId,
      hcs_seq_no: sequenceNumber,
      hcs_running_hash: runningHash,
      payload_hash: payloadHash,
      created_by_user_id: user.id,
    })
    .select("id, hcs_tx_id, hcs_seq_no, hcs_running_hash, payload_hash")
    .maybeSingle();

  if (insertResponse.error) {
    await cleanupIdempotencyKey();
    return NextResponse.json(
      { error: insertResponse.error.message },
      { status: 400 },
    );
  }

  if (eventType === "HANDOVER") {
    const { error: updateError } = await admin
      .from("batches")
      .update({
        pending_receipt_to_facility_id: nextPendingReceiptFacilityId,
        last_handover_event_id: eventId,
      })
      .eq("id", batch.id);

    if (updateError) {
      await cleanupIdempotencyKey();
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else if (eventType === "RECEIVED") {
    const { error: updateError } = await admin
      .from("batches")
      .update({
        current_owner_facility_id: nextOwnerFacilityId,
        pending_receipt_to_facility_id: null,
        last_handover_event_id: null,
      })
      .eq("id", batch.id);

    if (updateError) {
      await cleanupIdempotencyKey();
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else if (eventType === "DISPENSED") {
    const { error: updateError } = await admin
      .from("batches")
      .update({
        current_owner_facility_id: null,
        pending_receipt_to_facility_id: null,
        last_handover_event_id: null,
      })
      .eq("id", batch.id);

    if (updateError) {
      await cleanupIdempotencyKey();
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else if (eventType === "MANUFACTURED" && !batch.current_owner_facility_id) {
    const { error: updateError } = await admin
      .from("batches")
      .update({
        current_owner_facility_id: actorFacilityId,
      })
      .eq("id", batch.id);

    if (updateError) {
      await cleanupIdempotencyKey();
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (idempotencyKey) {
    await admin
      .from("idempotency_keys")
      .update({ event_id: eventId })
      .eq("key", idempotencyKey);
    idempotencyKeyCreated = false;
  }

  return NextResponse.json(
    {
      event: insertResponse.data,
      hederaDelivered,
    },
    { status: 201 },
  );
}
