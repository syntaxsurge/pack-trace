import pino from "pino";

import { getMqttClient } from "./mqtt-client";
import { suposConfig } from "./config";

const logger = pino(
  { name: "supos-publisher", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

export async function publishToSupos(topic: string, payload: unknown) {
  if (!suposConfig.enabled) {
    return;
  }

  const client = getMqttClient();
  const message = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    client.publish(
      topic,
      message,
      { qos: suposConfig.qos },
      (error?: Error) => {
        if (error) {
          logger.error({ err: error, topic }, "SupOS publish failed");
          reject(error);
          return;
        }

        logger.debug(
          { topic, bytes: Buffer.byteLength(message, "utf8"), qos: suposConfig.qos },
          "SupOS publish succeeded",
        );
        resolve();
      },
    );
  });
}
