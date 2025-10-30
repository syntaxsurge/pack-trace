"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ThermometerSun, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

const mqttEventSchema = z.object({
  topic: z.string(),
  payload: z.string(),
  json: z.unknown().nullable(),
  receivedAt: z.string().optional(),
});

const alertPayloadSchema = z.object({
  v: z.number().optional(),
  kind: z.string().optional(),
  summary: z.string(),
  windowMinutes: z.number().optional(),
  maxTemp: z.number().optional(),
  samples: z
    .array(
      z.object({
        ts: z.string(),
        value: z.number(),
      }),
    )
    .optional(),
  ts: z.string().optional(),
});

type AlertPayload = z.infer<typeof alertPayloadSchema>;

interface SuposAlertBannerProps {
  batchId: string;
  enabled?: boolean;
}

interface StreamState {
  status: "connecting" | "connected" | "error";
  errorMessage: string | null;
}

interface ActiveAlert {
  payload: AlertPayload;
  receivedAt: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;

export function SuposAlertBanner({ batchId, enabled = true }: SuposAlertBannerProps) {
  const [streamState, setStreamState] = useState<StreamState>({
    status: "connecting",
    errorMessage: null,
  });
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setActiveAlert(null);
      setStreamState({ status: "connecting", errorMessage: null });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const topic = `trace/batches/${batchId}/alerts/coldchain`;
    const params = new URLSearchParams();
    params.append("topic", topic);
    const source = new EventSource(`/api/stream/supos?${params.toString()}`);

    const handleReady = () => {
      reconnectAttempts.current = 0;
      setStreamState({ status: "connected", errorMessage: null });
    };

    const handleMqtt = (event: MessageEvent<string>) => {
      setStreamState((previous) =>
        previous.status === "connected"
          ? previous
          : { status: "connected", errorMessage: null },
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch (error) {
        console.error("[supos] failed to parse SSE payload", error);
        return;
      }

      const message = mqttEventSchema.safeParse(parsed);
      if (!message.success || message.data.topic !== topic) {
        return;
      }

      const payload = message.data.json ?? (() => {
        try {
          return JSON.parse(message.data.payload) as unknown;
        } catch {
          return null;
        }
      })();

      const alert = alertPayloadSchema.safeParse(payload);
      if (!alert.success) {
        return;
      }

      setActiveAlert({
        payload: alert.data,
        receivedAt: message.data.receivedAt ?? new Date().toISOString(),
      });
    };

    const handleError = () => {
      reconnectAttempts.current += 1;
      const attempts = reconnectAttempts.current;
      setStreamState({
        status: "error",
        errorMessage:
          attempts >= MAX_RECONNECT_ATTEMPTS
            ? "Unable to connect to SupOS alerts. SupOS may be offline or disabled."
            : "Lost connection to SupOS alerts. Retrying…",
      });

      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        source.close();
      }
    };

    const readyListener = (_event: MessageEvent<string>) => {
      handleReady();
    };
    const mqttListener = (event: MessageEvent<string>) => handleMqtt(event);
    const errorListener = () => handleError();

    source.addEventListener("ready", readyListener);
    source.addEventListener("mqtt", mqttListener);
    source.addEventListener("error", errorListener);
    source.onerror = () => handleError();

    return () => {
      source.removeEventListener("ready", readyListener);
      source.removeEventListener("mqtt", mqttListener);
      source.removeEventListener("error", errorListener);
      source.close();
    };
  }, [batchId, enabled]);

  const alertDetails = useMemo(() => {
    if (!activeAlert) {
      return null;
    }

    const samples = activeAlert.payload.samples ?? [];
    const peakSample = samples.reduce<{ value: number; ts: string } | null>(
      (accumulator, sample) =>
        !accumulator || sample.value > accumulator.value ? sample : accumulator,
      null,
    );

    const peakValue = peakSample?.value ?? null;
    const peakTimestamp = peakSample?.ts ?? activeAlert.payload.ts ?? null;
    const peakDisplay =
      peakTimestamp && !Number.isNaN(Date.parse(peakTimestamp))
        ? new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(peakTimestamp))
        : null;

    const windowMinutes = activeAlert.payload.windowMinutes ?? null;
    const maxTemp = activeAlert.payload.maxTemp ?? null;

    return {
      peakValue,
      peakDisplay,
      windowMinutes,
      maxTemp,
    };
  }, [activeAlert]);

  const receivedDisplay = useMemo(() => {
    if (!activeAlert) {
      return null;
    }

    const timestamp = activeAlert.payload.ts ?? activeAlert.receivedAt;
    if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
      return null;
    }

    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }, [activeAlert]);

  if (!enabled) {
    return null;
  }

  if (streamState.status === "error" && !activeAlert) {
    return (
      <div className="rounded border border-muted-foreground/30 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{streamState.errorMessage}</span>
        </div>
      </div>
    );
  }

  if (!activeAlert) {
    return null;
  }

  return (
    <div
      className="rounded border border-amber-300/60 bg-amber-200/20 px-4 py-4 text-sm text-amber-900 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <ThermometerSun className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-semibold uppercase tracking-wide text-amber-700">
            Cold-chain alert
          </p>
          <p>{activeAlert.payload.summary}</p>
          {alertDetails ? (
            <p className="text-xs text-amber-700">
              {[
                alertDetails.maxTemp !== null
                  ? `Threshold ${alertDetails.maxTemp.toFixed(1)}°C`
                  : null,
                alertDetails.windowMinutes !== null
                  ? `${alertDetails.windowMinutes} minute window`
                  : null,
                alertDetails.peakValue !== null
                  ? `Peak ${alertDetails.peakValue.toFixed(1)}°C`
                  : null,
                alertDetails.peakDisplay ? `Detected ${alertDetails.peakDisplay}` : null,
              ]
                .filter((segment): segment is string => Boolean(segment))
                .join(" · ")}
            </p>
          ) : null}
          {receivedDisplay ? (
            <p className="text-xs text-amber-700">
              Last update {receivedDisplay}
            </p>
          ) : null}
          <p className="text-xs text-amber-700">
            Data streamed from supOS Unified Namespace. Review live dashboards in{" "}
            <Link
              href="https://supos.ai/trial"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-amber-800 underline-offset-2 hover:underline"
            >
              supOS Traceability Live
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
