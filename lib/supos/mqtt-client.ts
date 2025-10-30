import mqtt, { type IClientOptions, type MqttClient } from "mqtt";

import { suposConfig } from "./config";

let cachedClient: MqttClient | null = null;

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
    console.info("[supos] mqtt connected", suposConfig.mqttUrl);
  });

  client.on("reconnect", () => {
    console.warn("[supos] mqtt reconnecting");
  });

  client.on("close", () => {
    console.warn("[supos] mqtt connection closed");
  });

  client.on("error", (error) => {
    console.error("[supos] mqtt error", error);
  });

  cachedClient = client;
  return client;
}

export function resetMqttClient() {
  cachedClient?.end(true);
  cachedClient = null;
}
