import { NextResponse } from "next/server";
import { z } from "zod";

import {
  OpenAiConfigError,
  OpenAiRequestError,
  generateColdChainSummary,
  type ColdChainSample,
} from "@/lib/ai/openai";

export const runtime = "nodejs";

const sampleSchema = z.object({
  ts: z.string().datetime(),
  value: z.number().finite(),
});

const requestSchema = z.object({
  batchId: z.string().uuid(),
  windowMinutes: z.number().int().positive(),
  maxTemp: z.number().finite(),
  samples: z.array(sampleSchema).min(1),
});

type SummaryData = z.infer<typeof requestSchema>;

function inferLikelyCause(samples: ColdChainSample[]): string {
  const peak = Math.max(...samples.map((sample) => sample.value));

  if (peak >= 12) {
    return "Possible refrigeration failure — check compressor and power continuity.";
  }

  if (peak >= 10) {
    return "Door held open too long or staging outside cold room — reinforce handling SOPs.";
  }

  return "Gradual drift — inspect seals and recalibrate sensors.";
}

function fallbackSummary(data: SummaryData, reason: string): string {
  const sorted = [...data.samples].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const peak = Math.max(...sorted.map((sample) => sample.value));
  const avg =
    sorted.reduce((acc, sample) => acc + sample.value, 0) / sorted.length || data.maxTemp;
  const durationMinutes = Math.max(
    data.windowMinutes,
    Math.round(
      (new Date(last.ts).getTime() - new Date(first.ts).getTime()) / 60000,
    ),
  );

  const cause = inferLikelyCause(sorted);

  return [
    `Batch ${data.batchId} exceeded ${data.maxTemp.toFixed(
      1,
    )}°C for roughly ${durationMinutes} minutes (peak ${peak.toFixed(
      1,
    )}°C, mean ${avg.toFixed(1)}°C).`,
    `${cause} (${reason}).`,
  ].join(" ");
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cold-chain summary payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  let summary: string;

  try {
    summary = await generateColdChainSummary(data);
  } catch (error) {
    if (error instanceof OpenAiConfigError) {
      console.warn("[supos] OpenAI configuration missing, using deterministic summary.");
    } else if (error instanceof OpenAiRequestError) {
      console.error("[supos] OpenAI request failed, using deterministic summary.", error);
    } else {
      console.error("[supos] Unexpected error generating AI summary.", error);
    }

    summary = fallbackSummary(
      data,
      error instanceof Error ? error.message : "AI summary unavailable",
    );
  }

  return NextResponse.json({
    summary,
    windowMinutes: data.windowMinutes,
    maxTemp: data.maxTemp,
    samples: data.samples,
  });
}
