import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import pino from "pino";

import { suposConfig } from "./config";

let cachedClient: MqttClient | null = null;
const logger = pino(
  { name: "supos-mqtt", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

export function getMqttClient(): MqttClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (!suposConfig.enabled) {
    throw new Error("SupOS bridge is disabled. Set SUPOS_BRIDGE_ENABLED=true to publish events.");
  }

  const options: IClientOptions = {
    clientId: suposConfig.clientId,
    username: suposConfig.mqttUsername,
    password: suposConfig.mqttPassword,
    keepalive: 60,
    reconnectPeriod: 1_000,
    clean: true,
  };

  const client = mqtt.connect(suposConfig.mqttUrl, options);

  client.on("connect", () => {
    logger.info({ url: suposConfig.mqttUrl }, "SupOS MQTT connected");
  });

  client.on("reconnect", () => {
    logger.warn("SupOS MQTT reconnecting…");
  });

  client.on("close", () => {
    logger.warn("SupOS MQTT connection closed");
  });

  client.on("error", (error) => {
    logger.error({ err: error }, "SupOS MQTT error");
  });

  cachedClient = client;
  return client;
}

export function resetMqttClient() {
  if (cachedClient) {
    logger.info("Resetting SupOS MQTT client");
    cachedClient.end(true);
  }
  cachedClient = null;
}
