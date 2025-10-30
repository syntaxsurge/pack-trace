const enabled = (process.env.SUPOS_BRIDGE_ENABLED ?? "false").toLowerCase() === "true";

export const suposConfig = Object.freeze({
  enabled,
  mqttUrl: process.env.SUPOS_MQTT_URL ?? "mqtt://localhost:1883",
  mqttUsername: process.env.SUPOS_MQTT_USERNAME || undefined,
  mqttPassword: process.env.SUPOS_MQTT_PASSWORD || undefined,
  qos: Math.min(2, Math.max(0, Number(process.env.SUPOS_BRIDGE_QOS ?? "1"))) as 0 | 1 | 2,
  clientId:
    process.env.SUPOS_CLIENT_ID ??
    `pack-trace-${typeof window === "undefined" ? process.pid : Math.random()
      .toString(16)
      .slice(2)}`,
  concurrency: Number(process.env.SUPOS_BRIDGE_CONCURRENCY ?? "8"),
  maxAttempts: Number(process.env.SUPOS_BRIDGE_MAX_ATTEMPTS ?? "8"),
  baseDelayMs: Number(process.env.SUPOS_BRIDGE_BASE_DELAY_MS ?? "1000"),
});

export type SuposConfig = typeof suposConfig;

export function assertSuposServiceRoleConfig() {
  if (!enabled) {
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when SUPOS bridge is enabled.");
  }
}
