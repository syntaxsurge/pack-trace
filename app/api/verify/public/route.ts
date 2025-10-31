import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { sanitizeVerifyState } from "@/lib/verify/public";
import { verifyCode } from "@/lib/verify/service";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const CAPTCHA_THRESHOLD = 5;
const CAPTCHA_EXPIRY_MS = 5 * 60_000;
const CAPTCHA_SECRET =
  process.env.PUBLIC_VERIFY_CAPTCHA_SECRET ?? "pack-trace-verify";

type RateLimitEntry = {
  windowStart: number;
  count: number;
  challenge?: CaptchaChallenge | null;
};

type CaptchaChallenge = {
  id: string;
  prompt: string;
  answerHash: string;
  expiresAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const querySchema = z.object({
  code: z.string().optional(),
  captchaId: z.string().optional(),
  captchaAnswer: z.string().optional(),
  cursor: z.string().optional(),
});

const RESPONSE_HEADERS = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
  "X-Robots-Tag": "noindex",
} as const;

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [primary] = forwarded.split(",").map((part) => part.trim());
    if (primary) return primary;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

function createCaptchaChallenge(): CaptchaChallenge {
  const a = Math.floor(Math.random() * 10) + 10;
  const b = Math.floor(Math.random() * 10) + 1;
  const answer = (a + b).toString();
  const id = crypto.randomUUID();
  const answerHash = crypto
    .createHash("sha256")
    .update(`${id}:${answer}:${CAPTCHA_SECRET}`)
    .digest("hex");

  return {
    id,
    prompt: `What is ${a} + ${b}?`,
    answerHash,
    expiresAt: Date.now() + CAPTCHA_EXPIRY_MS,
  };
}

function verifyCaptcha(entry: RateLimitEntry, captchaId: string, answer: string) {
  const challenge = entry.challenge;
  if (!challenge || challenge.id !== captchaId) {
    return false;
  }

  if (challenge.expiresAt < Date.now()) {
    entry.challenge = null;
    return false;
  }

  const answerHash = crypto
    .createHash("sha256")
    .update(`${challenge.id}:${answer.trim()}:${CAPTCHA_SECRET}`)
    .digest("hex");

  return answerHash === challenge.answerHash;
}

function withHeaders(response: NextResponse) {
  Object.entries(RESPONSE_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function GET(request: Request) {
  const clientKey = getClientKey(request);
  const now = Date.now();
  const entry =
    rateLimitStore.get(clientKey) ??
    { windowStart: now, count: 0, challenge: null };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.windowStart = now;
    entry.count = 0;
    entry.challenge = null;
  }

  entry.count += 1;
  rateLimitStore.set(clientKey, entry);

  const rawQuery = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parseResult = querySchema.safeParse(rawQuery);

  if (!parseResult.success) {
    const response = NextResponse.json(
      { error: "Invalid query parameters.", details: parseResult.error.flatten() },
      { status: 400 },
    );
    return withHeaders(response);
  }

  if (entry.count > RATE_LIMIT_MAX) {
    const response = NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
    return withHeaders(response);
  }

  const { captchaId, captchaAnswer } = parseResult.data;

  if (entry.count > CAPTCHA_THRESHOLD) {
    if (
      !captchaId ||
      !captchaAnswer ||
      !verifyCaptcha(entry, captchaId, captchaAnswer)
    ) {
      entry.challenge =
        entry.challenge && entry.challenge.expiresAt > now
          ? entry.challenge
          : createCaptchaChallenge();

      const response = NextResponse.json(
        {
          error: captchaId ? "Invalid captcha answer." : "Captcha required.",
          challenge: {
            id: entry.challenge.id,
            prompt: entry.challenge.prompt,
          },
        },
        { status: captchaId ? 403 : 429 },
      );
      return withHeaders(response);
    }

    entry.challenge = null;
    entry.count = 0;
  }

  try {
    const state = await verifyCode({
      code: parseResult.data.code ?? null,
      cursor: parseResult.data.cursor ?? null,
      limit: 5,
    });

    const sanitized = sanitizeVerifyState(state);
    const response = NextResponse.json({ state: sanitized }, { status: 200 });
    return withHeaders(response);
  } catch (error) {
    const response = NextResponse.json(
      { error: (error as Error).message ?? "Verification failed." },
      { status: 500 },
    );
    return withHeaders(response);
  }
}
