import type { ParsedGs1Datamatrix } from "@/lib/labels/gs1";
import type { CustodyTimelineEntry } from "@/lib/hedera/timeline";

export type VerifyStatus =
  | "idle"
  | "genuine"
  | "unknown"
  | "mismatch"
  | "recalled"
  | "error";

export interface VerifyFacility {
  id: string;
  name: string | null;
  type: string | null;
}

export interface VerifyBatch {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  label_text: string | null;
  topic_id: string | null;
  current_owner_facility_id: string | null;
  current_owner_facility: VerifyFacility | null;
  pending_receipt_to_facility_id: string | null;
  last_handover_event_id: string | null;
  created_at: string;
}

export interface VerifyState {
  code: string | null;
  parsed: ParsedGs1Datamatrix | null;
  parseError: string | null;
  status: VerifyStatus;
  message: string | null;
  batch: VerifyBatch | null;
  timelineEntries: CustodyTimelineEntry[];
  timelineNote: string | null;
  timelineError: string | null;
  nextCursor: string | null;
  topicId: string | null;
  facilities: Record<string, VerifyFacility>;
}
