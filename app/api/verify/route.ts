import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCode } from "@/lib/verify/service";

const querySchema = z.object({
  code: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export async function GET(request: Request) {
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
