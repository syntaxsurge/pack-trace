import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTraceabilityCertificatePdf,
  buildTraceabilityCsv,
  loadTraceabilitySnapshot,
  TraceabilityReportError,
} from "@/lib/reports";

const querySchema = z.object({
  batchId: z.string().uuid(),
  format: z.enum(["pdf", "csv"]).default("pdf"),
});

function parseQuery(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const format = url.searchParams.get("format") ?? "pdf";

  const parsed = querySchema.safeParse({ batchId, format });

  if (!parsed.success) {
    throw new TraceabilityReportError("Invalid query parameters.", 400);
  }

  return parsed.data;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildFilename(
  params: { gtin: string; lot: string; id: string },
  extension: "pdf" | "csv",
): string {
  const gtin = sanitizeSegment(params.gtin);
  const lot = sanitizeSegment(params.lot);

  const parts = [
    "traceability",
    gtin || "batch",
    lot || params.id.slice(0, 8),
  ].filter(Boolean);

  return `${parts.join("-")}.${extension}`;
}

export async function GET(request: Request) {
  try {
    const { batchId, format } = parseQuery(request);

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json(
        { error: userError.message },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const adminClient = createAdminClient();
    const snapshot = await loadTraceabilitySnapshot(
      batchId,
      supabase,
      adminClient,
    );

    const filename = buildFilename(
      {
        gtin: snapshot.batch.gtin,
        lot: snapshot.batch.lot,
        id: snapshot.batch.id,
      },
      format,
    );

    if (format === "pdf") {
      const buffer = await buildTraceabilityCertificatePdf(snapshot);
      const pdfBytes = new Uint8Array(buffer);
      return new NextResponse(pdfBytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = buildTraceabilityCsv(snapshot);
    const encoder = new TextEncoder();
    const body = encoder.encode(csv);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof TraceabilityReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to generate report", error);

    return NextResponse.json(
      { error: "Unable to generate report. Check the server logs for details." },
      { status: 500 },
    );
  }
}
