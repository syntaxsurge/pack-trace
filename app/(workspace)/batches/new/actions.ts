"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  batchLabelInputSchema,
  buildGs1DatamatrixPayload,
} from "@/lib/labels/gs1";

export type CreateBatchActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors: Record<string, string>;
  batchId?: string;
};

export async function createBatchAction(
  _prevState: CreateBatchActionState,
  formData: FormData,
): Promise<CreateBatchActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: "error",
      errors: { form: userError.message },
    };
  }

  if (!user) {
    return {
      status: "error",
      errors: { form: "You must be signed in to create a batch." },
    };
  }

  const rawInput = {
    productName: formData.get("productName"),
    gtin: formData.get("gtin"),
    lot: formData.get("lot"),
    expiry: formData.get("expiry"),
    quantity: formData.get("quantity"),
  };

  const parseResult = batchLabelInputSchema.safeParse(rawInput);

  if (!parseResult.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parseResult.error.issues) {
      const fieldKey = issue.path[0];
      if (typeof fieldKey === "string" && !fieldErrors[fieldKey]) {
        fieldErrors[fieldKey] = issue.message;
      }
    }

    return {
      status: "error",
      errors: fieldErrors,
    };
  }

  const parsed = parseResult.data;
  const label = buildGs1DatamatrixPayload(parsed);

  const profileResponse = await supabase
    .from("users")
    .select("facility_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    return {
      status: "error",
      errors: { form: profileResponse.error.message },
    };
  }

  const facilityId = profileResponse.data?.facility_id ?? null;

  if (!facilityId) {
    return {
      status: "error",
      errors: {
        form: "Assign this user to a facility before creating batches.",
      },
    };
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
    return {
      status: "error",
      errors: { form: insertResponse.error.message },
    };
  }

  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "Batch created and label generated.",
    errors: {},
    batchId: insertResponse.data?.id ?? undefined,
  };
}
