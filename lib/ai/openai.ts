import { serverEnv } from "../env/server";

export class OpenAiConfigError extends Error {
  constructor(message = "OpenAI configuration is missing or invalid.") {
    super(message);
    this.name = "OpenAiConfigError";
  }
}

export class OpenAiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiRequestError";
  }
}

export interface ColdChainSample {
  ts: string;
  value: number;
}

export interface ColdChainSummaryInput {
  batchId: string;
  windowMinutes: number;
  maxTemp: number;
  samples: ColdChainSample[];
}

const OPENAI_MODEL = serverEnv.openAiModel;
const OPENAI_API_URL = serverEnv.openAiApiUrl;

function getApiKey(): string {
  if (!serverEnv.openAiApiKey) {
    throw new OpenAiConfigError(
      "Set OPENAI_API_KEY to enable cold-chain excursion summaries.",
    );
  }

  return serverEnv.openAiApiKey;
}

function buildPrompt(input: ColdChainSummaryInput): string {
  const { batchId, windowMinutes, maxTemp, samples } = input;
  const sorted = [...samples].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  const peak = sorted.length
    ? Math.max(...sorted.map((sample) => sample.value))
    : maxTemp;
  const readings = sorted
    .map((sample) => `${sample.ts} → ${sample.value.toFixed(1)}°C`)
    .join("\n");

  return [
    "You are an industrial cold-chain reliability analyst.",
    "Summarize the excursion in 2 sentences max.",
    "Focus on duration, severity, and plausible operator-facing remediation guidance.",
    "Avoid marketing language. Be concise and actionable.",
    "",
    `Batch: ${batchId}`,
    `Threshold: ${maxTemp.toFixed(1)}°C`,
    `Window inspected: ${windowMinutes} minutes`,
    `Peak temperature: ${peak.toFixed(1)}°C`,
    "Readings (ISO8601 timestamp → °C):",
    readings || "No readings provided.",
  ].join("\n");
}

export async function generateColdChainSummary(
  input: ColdChainSummaryInput,
): Promise<string> {
  const apiKey = getApiKey();
  const prompt = buildPrompt(input);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            "You are a manufacturing reliability engineer who writes clear, direct incident summaries.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new OpenAiRequestError(
      `OpenAI request failed (${response.status}): ${errorPayload}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } | null }> | null;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new OpenAiRequestError("OpenAI response did not include a summary message.");
  }

  return content;
}
