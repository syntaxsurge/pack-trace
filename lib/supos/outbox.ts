import pino from "pino";

import { createAdminClient } from "../supabase/admin";

import { suposConfig } from "./config";

const logger = pino(
  { name: "supos-outbox", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

const admin = createAdminClient();

type OutboxStatus = "PENDING" | "IN_PROGRESS" | "SENT" | "FAILED";

export interface SuposOutboxRecord {
  id: number;
  event_id: string;
  batch_id: string;
  topic: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  next_retry_at: string;
  last_error: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  published_at: string | null;
  created_at: string;
}

export async function markSent(id: number) {
  const { error } = await admin
    .from("supos_outbox")
    .update({
      status: "SENT",
      published_at: new Date().toISOString(),
      last_error: null,
      claimed_by: null,
      claimed_at: null,
    })
    .eq("id", id);

  if (error) {
    logger.error({ err: error, id }, "failed to mark outbox row as sent");
    throw error;
  }
}

export async function markFailed(id: number, attempts: number, errorMessage: string) {
  const nextAttempt = attempts + 1;
  const maxAttempts = Number.isFinite(suposConfig.maxAttempts)
    ? suposConfig.maxAttempts
    : 8;
  const cappedMaxAttempts = Math.max(1, maxAttempts);

  const baseDelay = Number.isFinite(suposConfig.baseDelayMs)
    ? suposConfig.baseDelayMs
    : 1_000;
  const cappedBaseDelay = Math.max(500, baseDelay);
  const computedDelay = Math.min(
    60_000,
    Math.ceil(cappedBaseDelay * Math.pow(2, attempts)),
  );

  const nextRetryAt =
    nextAttempt >= cappedMaxAttempts
      ? null
      : new Date(Date.now() + computedDelay).toISOString();

  const update = {
    status: nextAttempt >= cappedMaxAttempts ? "FAILED" : "PENDING",
    attempts: nextAttempt,
    next_retry_at: nextRetryAt,
    last_error: errorMessage.slice(0, 2000),
    claimed_by: null,
    claimed_at: null,
  } as const;

  const { error } = await admin.from("supos_outbox").update(update).eq("id", id);

  if (error) {
    logger.error({ err: error, id }, "failed to mark outbox row as failed");
    throw error;
  }
}

export async function releaseClaim(id: number) {
  const { error } = await admin
    .from("supos_outbox")
    .update({
      status: "PENDING",
      claimed_by: null,
      claimed_at: null,
    })
    .eq("id", id);

  if (error) {
    logger.error({ err: error, id }, "failed to release outbox claim");
    throw error;
  }
}
