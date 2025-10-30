import "dotenv/config";
import pino from "pino";

import { createAdminClient } from "../lib/supabase/admin";
import { assertSuposServiceRoleConfig, suposConfig } from "../lib/supos/config";
import { publishToSupos } from "../lib/supos/publisher";
import { markFailed, markSent, type SuposOutboxRecord } from "../lib/supos/outbox";

assertSuposServiceRoleConfig();

const logger = pino(
  { name: "supos-worker", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

if (!suposConfig.enabled) {
  logger.info("SupOS bridge disabled. Exiting worker.");
  process.exit(0);
}

const WORKER_ID = `supos-worker-${Math.random().toString(16).slice(2)}`;
const supabase = createAdminClient();

async function claimSuposOutboxBatch(limit: number): Promise<SuposOutboxRecord[]> {
  const { data, error } = await supabase.rpc("claim_supos_outbox", {
    p_worker_id: WORKER_ID,
    p_batch: limit,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return data as SuposOutboxRecord[];
}

async function processRow(row: SuposOutboxRecord) {
  try {
    await publishToSupos(row.topic, row.payload);
    await markSent(row.id);
    logger.info({ id: row.id, topic: row.topic }, "published SupOS outbox event");
  } catch (error) {
    logger.error({ id: row.id, topic: row.topic, error }, "failed to publish SupOS event");
    await markFailed(row.id, row.attempts, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  logger.info(
    {
      workerId: WORKER_ID,
      concurrency: suposConfig.concurrency,
      mqttUrl: suposConfig.mqttUrl,
    },
    "SupOS outbox worker started",
  );

  while (true) {
    const rows = await claimSuposOutboxBatch(suposConfig.concurrency);

    if (!rows.length) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }

    await Promise.all(rows.map((row) => processRow(row)));
  }
}

main().catch((error) => {
  logger.fatal({ error }, "SupOS outbox worker crashed");
  process.exit(1);
});
