import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createReceiptRecord } from "@/lib/receipts/service";
import { sendSms } from "@/lib/messaging/sms";

const requestSchema = z.object({
  batchId: z.string().uuid(),
  patientRef: z.string().trim().max(160).optional(),
  phoneNumber: z.string().trim().optional(),
  sendSms: z.boolean().optional(),
  smsProvider: z.enum(["twilio", "africas-talking", "auto"]).optional(),
  message: z.string().max(480).optional(),
});

export async function POST(request: Request) {
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

  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parseResult = requestSchema.safeParse(rawPayload);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parseResult.data;

  const profileResponse = await supabase
    .from("users")
    .select("facility_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    return NextResponse.json(
      { error: profileResponse.error.message },
      { status: 400 },
    );
  }

  const facilityId = profileResponse.data?.facility_id ?? null;

  if (!facilityId) {
    return NextResponse.json(
      {
        error: "Assign this user to a facility before issuing receipts.",
      },
      { status: 409 },
    );
  }

  const issuingFacilityId = facilityId as string;

  const batchResponse = await supabase
    .from("batches")
    .select("id, product_name, gtin, lot, expiry, qty, label_text")
    .eq("id", payload.batchId)
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

  let receipt;

  try {
    receipt = await createReceiptRecord({
      supabase,
      batchId: payload.batchId,
      pharmacyFacilityId: issuingFacilityId,
      patientRef: payload.patientRef ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Failed to create receipt." },
      { status: 400 },
    );
  }

  let smsResult:
    | { status: "skipped" }
    | { status: "sent" | "queued"; provider: string; reference: string }
    | { status: "error"; message: string } = { status: "skipped" };

  const shouldSendSms = Boolean(payload.sendSms && payload.phoneNumber);

  if (shouldSendSms) {
    const destination = payload.phoneNumber as string;
    const message =
      payload.message ??
      `Genuine pack dispensed: ${batch.product_name ?? batch.gtin}. Receipt code ${receipt.shortcode}.`;

    try {
      const result = await sendSms({
        to: destination,
        body: message,
        provider: payload.smsProvider ?? "auto",
      });

      if (result) {
        smsResult = {
          status: result.status,
          provider: result.provider,
          reference: result.reference,
        };
      }
    } catch (error) {
      smsResult = {
        status: "error",
        message: (error as Error).message ?? "SMS delivery failed.",
      };
    }
  }

  return NextResponse.json(
    {
      receipt: {
        id: receipt.id,
        shortcode: receipt.shortcode,
        patientRef: payload.patientRef ?? null,
      },
      batch,
      sms: smsResult,
    },
    { status: 201 },
  );
}
