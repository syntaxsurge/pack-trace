import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { batchLabelInputSchema, buildGs1DatamatrixPayload } from "@/lib/labels/gs1";

const requestSchema = z.object({
  productName: z.string(),
  gtin: z.string(),
  lot: z.string(),
  expiry: z.string(),
  quantity: z.union([z.number(), z.string()]),
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawParse = requestSchema.safeParse(payload);

  if (!rawParse.success) {
    return NextResponse.json(
      {
        error: "Invalid request.",
        details: rawParse.error.flatten(),
      },
      { status: 400 },
    );
  }

  const parseResult = batchLabelInputSchema.safeParse({
    productName: rawParse.data.productName,
    gtin: rawParse.data.gtin,
    lot: rawParse.data.lot,
    expiry: rawParse.data.expiry,
    quantity: rawParse.data.quantity,
  });

  if (!parseResult.success) {
    const details = parseResult.error.flatten();

    return NextResponse.json(
      {
        error: "Validation failed.",
        details,
      },
      { status: 400 },
    );
  }

  const parsed = parseResult.data;
  const label = buildGs1DatamatrixPayload(parsed);

  const profileResponse = await supabase
    .from("users")
    .select("facility_id")
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
        error: "Assign this user to a facility before creating batches.",
      },
      { status: 409 },
    );
  }

  const insertResponse = await supabase
    .from("batches")
    .insert({
      product_name: parsed.productName,
      gtin: label.gtin14,
      lot: label.lot,
      expiry: parsed.expiry,
      qty: parsed.quantity,
      label_text: label.humanReadable,
      current_owner_facility_id: facilityId,
      created_by_user_id: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertResponse.error) {
    return NextResponse.json(
      { error: insertResponse.error.message },
      { status: 400 },
    );
  }

  const batchId = insertResponse.data?.id;

  return NextResponse.json(
    {
      batchId,
      labelText: label.humanReadable,
      labelPayload: label,
      pdfUrl: batchId ? `/api/batches/${batchId}/label` : null,
    },
    { status: 201 },
  );
}
