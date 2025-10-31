import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCode } from "@/lib/verify/service";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX_REQUESTS = 45;
const RATE_LIMIT_CLEANUP_THRESHOLD = 1_024;
const rateLimitBuckets = new Map<string, RateLimitBucket>();

const querySchema = z.object({
  code: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

function getClientIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first) return first.trim();
  }

  const fallbacks = [
    "x-real-ip",
    "x-client-ip",
    "cf-connecting-ip",
    "true-client-ip",
  ];

  for (const header of fallbacks) {
    const value = request.headers.get(header);
    if (value) return value.trim();
  }

  return "unknown";
}

function cleanupRateLimitBuckets(now: number) {
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function takeRateLimit(identifier: string, now: number) {
  const existing = rateLimitBuckets.get(identifier);

  if (!existing || now >= existing.resetAt) {
    rateLimitBuckets.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });

    return { limited: false, retryAfterSeconds: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1_000),
    );

    return { limited: true, retryAfterSeconds };
  }

  existing.count += 1;

  return { limited: false, retryAfterSeconds: 0 };
}

export async function GET(request: Request) {
  const now = Date.now();
  if (rateLimitBuckets.size > RATE_LIMIT_CLEANUP_THRESHOLD) {
    cleanupRateLimitBuckets(now);
  }

  const clientIdentifier = getClientIdentifier(request);
  const rateLimit = takeRateLimit(clientIdentifier, now);

  if (rateLimit.limited) {
    return NextResponse.json(
      {
        error: "Too many verification attempts. Try again shortly.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            rateLimit.retryAfterSeconds ||
              Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000),
          ),
        },
      },
    );
  }

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const queryParse = querySchema.safeParse(rawQuery);

  if (!queryParse.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: queryParse.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const state = await verifyCode({
      code: queryParse.data.code ?? null,
      cursor: queryParse.data.cursor ?? null,
      limit: queryParse.data.limit ?? 10,
    });

    return NextResponse.json({ state });
  } catch (error) {
    console.error("Verify API error", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Verification failed." },
      { status: 500 },
    );
  }
}
