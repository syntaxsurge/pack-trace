import "dotenv/config";
import mqtt from "mqtt";
import pino from "pino";

import { suposConfig } from "../lib/supos/config";

const logger = pino(
  { name: "supos-temp-sim", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

interface CliOptions {
  batchId: string;
  intervalMs: number;
  baseline: number;
  swing: number;
  jitter: number;
}

function parseArgs(): CliOptions {
  const [, , ...rest] = process.argv;

  const options = rest.reduce<Record<string, string>>((acc, arg) => {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      acc[match[1]] = match[2];
      return acc;
    }

    if (!acc._) {
      acc._ = arg;
    }

    return acc;
  }, {});

  const batchId = options._ ?? "";

  if (!batchId) {
    logger.fatal("Usage: pnpm sim:temp -- <batch-id> [--intervalMs=5000] [--baseline=7.5] [--swing=1.5] [--jitter=0.4]");
    process.exit(1);
  }

  const intervalMs = Number(options.intervalMs ?? 5_000);
  const baseline = Number(options.baseline ?? 7.5);
  const swing = Number(options.swing ?? 1.5);
  const jitter = Number(options.jitter ?? 0.4);

  return {
    batchId,
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5_000,
    baseline: Number.isFinite(baseline) ? baseline : 7.5,
    swing: Number.isFinite(swing) ? swing : 1.5,
    jitter: Number.isFinite(jitter) ? jitter : 0.4,
  };
}

function computeTemperature(now: number, options: CliOptions): number {
  const phase = now / 45_000;
  const wave = Math.sin(phase * Math.PI * 2) * options.swing;
  const randomJitter = (Math.random() - 0.5) * 2 * options.jitter;
  const temperature = options.baseline + wave + randomJitter;
  return Math.round(temperature * 10) / 10;
}

function main() {
  const options = parseArgs();
  const mqttUrl = suposConfig.mqttUrl;

  const aggregateTopic = "trace/sensors/tempC";

  logger.info(
    {
      mqttUrl,
      topic: aggregateTopic,
      intervalMs: options.intervalMs,
      batchId: options.batchId,
    },
    "starting SupOS temperature simulator",
  );

  const client = mqtt.connect(mqttUrl, {
    clientId: `sensor-temp-${Math.random().toString(16).slice(2)}`,
    username: suposConfig.mqttUsername,
    password: suposConfig.mqttPassword,
    keepalive: 30,
    reconnectPeriod: 1_000,
  });

  client.on("connect", () => {
    logger.info({ url: mqttUrl }, "connected to MQTT broker");

    const interval = setInterval(() => {
      const now = Date.now();
      const value = computeTemperature(now, options);
      const payload = {
        v: 1,
        value,
        ts: new Date(now).toISOString(),
        batchId: options.batchId,
      };

      client.publish(
        aggregateTopic,
        JSON.stringify(payload),
        { qos: 1 },
        (error?: Error) => {
          if (error) {
            logger.error({ error, topic: aggregateTopic }, "failed to publish temperature reading");
            return;
          }

          logger.debug({ topic: aggregateTopic, value }, "published temperature reading");
        },
      );
    }, options.intervalMs);

    const shutdown = () => {
      clearInterval(interval);
      client.end(true, () => {
        logger.info("temperature simulator stopped");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

  client.on("error", (error) => {
    logger.error({ error }, "MQTT connection error");
  });

  client.on("close", () => {
    logger.warn("MQTT connection closed");
  });
}

main();
