import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { NextRequest } from "next/server";
import pino from "pino";

import { suposConfig } from "@/lib/supos/config";

export const runtime = "nodejs";

const logger = pino(
  { name: "supos-sse", level: process.env.LOG_LEVEL ?? "info" },
  pino.destination({ sync: false }),
);

const encoder = new TextEncoder();

function formatSse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function createMqttClient(): MqttClient {
  const options: IClientOptions = {
    clientId: `supos-sse-${Math.random().toString(16).slice(2)}`,
    username: suposConfig.mqttUsername,
    password: suposConfig.mqttPassword,
    keepalive: 30,
    reconnectPeriod: 1_000,
    clean: true,
  };

  return mqtt.connect(suposConfig.mqttUrl, options);
}

export async function GET(request: NextRequest) {
  if (!suposConfig.enabled) {
    logger.warn("SupOS SSE requested while bridge disabled");
    return new Response(
      JSON.stringify({ error: "SupOS bridge disabled on this environment." }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const topics = [
    ...request.nextUrl.searchParams.getAll("topic"),
    ...request.nextUrl.searchParams.getAll("t"),
  ].filter((topic) => topic.length > 0);

  if (topics.length === 0) {
    return new Response(
      JSON.stringify({ error: "Provide at least one topic via `topic` query param." }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  logger.info({ topics }, "opening SupOS SSE stream");

  let closeStream: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client = createMqttClient();
      let closed = false;
      let heartbeat: NodeJS.Timeout | null = null;

      const cleanUp = (reason?: unknown) => {
        if (closed) return;
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        client.removeAllListeners();
        client.end(true);
        if (reason instanceof Error) {
          logger.warn({ err: reason }, "SupOS SSE stream closed with error");
        } else {
          logger.info("SupOS SSE stream closed");
        }
        try {
          controller.close();
        } catch (error) {
          logger.debug({ err: error }, "controller close failed");
        }
      };

      closeStream = () => cleanUp("cancel");

      request.signal.addEventListener("abort", () => cleanUp("abort"));

      client.on("connect", () => {
        logger.info({ topics }, "SupOS SSE connected to MQTT");
        controller.enqueue(formatSse("ready", { ok: true, topics }));

        const subscribeNext = () =>
          topics.forEach((topic) => {
            client.subscribe(topic, { qos: 0 }, (error) => {
              if (error) {
                logger.error({ err: error, topic }, "failed to subscribe to topic");
                controller.enqueue(
                  formatSse("error", {
                    message: `Failed to subscribe to ${topic}`,
                  }),
                );
              }
            });
          });

        subscribeNext();

        heartbeat = setInterval(() => {
          controller.enqueue(formatSse("ping", { ts: Date.now() }));
        }, 15_000);
      });

      client.on("message", (topic, payload) => {
        const text = payload.toString("utf-8");
        let json: unknown = null;
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = null;
        }

        controller.enqueue(
          formatSse("mqtt", {
            topic,
            payload: text,
            json,
            receivedAt: new Date().toISOString(),
          }),
        );
      });

      client.on("error", (error) => {
        logger.error({ err: error }, "SupOS SSE MQTT error");
        controller.enqueue(
          formatSse("error", {
            message: error.message,
          }),
        );
      });

      client.on("close", () => cleanUp("close"));
    },
    cancel() {
      logger.info("SupOS SSE stream cancelled by client");
      closeStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store, no-transform",
      "content-type": "text/event-stream",
      connection: "keep-alive",
    },
  });
}
