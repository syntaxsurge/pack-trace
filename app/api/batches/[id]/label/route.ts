import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  batchLabelInputSchema,
  buildGs1DatamatrixPayload,
} from "@/lib/labels/gs1";
import { buildBatchLabelPdf } from "@/lib/labels/pdf";

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
        current_owner_facility_id,
        created_at,
        facility:facilities!batches_current_owner_facility_id_fkey(
          id,
          name
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

  const parsePayload = batchLabelInputSchema.safeParse({
    productName: batch.product_name ?? batch.gtin,
    gtin: batch.gtin,
    lot: batch.lot,
    expiry: batch.expiry,
    quantity: batch.qty,
  });

  if (!parsePayload.success) {
    return NextResponse.json(
      { error: "Stored batch data is invalid." },
      { status: 500 },
    );
  }

  const gs1Payload = buildGs1DatamatrixPayload(parsePayload.data);

  const facilityRecord = Array.isArray(batch.facility)
    ? (batch.facility[0] as { name?: string } | undefined)
    : null;

  const pdf = await buildBatchLabelPdf({
    payload: gs1Payload,
    productName: parsePayload.data.productName,
    quantity: parsePayload.data.quantity,
    facilityName: facilityRecord?.name ?? null,
  });

  const filename = `pack-trace-label-${gs1Payload.gtin14}-${gs1Payload.lot}.pdf`;
  const body = new Uint8Array(pdf);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
