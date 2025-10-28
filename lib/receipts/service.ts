import { randomInt } from "node:crypto";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

const SHORTCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomShortcode(length: number): string {
  let value = "";
  const alphabetLength = SHORTCODE_ALPHABET.length;

  for (let index = 0; index < length; index += 1) {
    const random = randomInt(alphabetLength);
    value += SHORTCODE_ALPHABET[random];
  }

  return value;
}

function isUniqueViolation(error: PostgrestError | null): boolean {
  return Boolean(error && error.code === "23505");
}

export interface CreateReceiptParams {
  supabase: SupabaseClient;
  batchId: string;
  pharmacyFacilityId: string;
  patientRef?: string | null;
  shortcodeLength?: number;
}

export interface CreateReceiptResult {
  id: string;
  shortcode: string;
}

export async function createReceiptRecord({
  supabase,
  batchId,
  pharmacyFacilityId,
  patientRef,
  shortcodeLength = 6,
}: CreateReceiptParams): Promise<CreateReceiptResult> {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shortcode = randomShortcode(shortcodeLength);

    const { data, error } = await supabase
      .from("receipts")
      .insert({
        batch_id: batchId,
        pharmacy_facility_id: pharmacyFacilityId,
        patient_ref: patientRef ?? null,
        shortcode,
      })
      .select("id, shortcode")
      .maybeSingle();

    if (!error && data) {
      return data as CreateReceiptResult;
    }

    if (!isUniqueViolation(error)) {
      throw new Error(error?.message ?? "Unable to create receipt.");
    }
  }

  throw new Error("Unable to allocate a unique receipt code. Try again.");
}
