export type CustodyEventType =
  | "MANUFACTURED"
  | "RECEIVED"
  | "HANDOVER"
  | "DISPENSED"
  | "RECALLED";

export interface CustodyEventBatch {
  gtin: string;
  lot: string;
  exp: string;
}

export interface CustodyEventActor {
  facilityId: string;
  role: string;
}

export interface CustodyEventTarget {
  facilityId: string;
}

export interface CustodyEventPayload {
  v: number;
  type: CustodyEventType;
  batch: CustodyEventBatch;
  actor: CustodyEventActor;
  to?: CustodyEventTarget | null;
  ts: string;
  prev?: string | null;
  meta?: Record<string, unknown>;
}

