import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";

import { formatConsensusTimestamp } from "@/lib/hedera/format";
import { serverEnv } from "@/lib/env/server";
import { getPdfPrinter } from "@/lib/pdf/printer";

import type { TraceabilitySnapshot } from "./data";

const printer = getPdfPrinter();

function resolveFacilityName(
  snapshot: TraceabilitySnapshot,
  facilityId: string | null | undefined,
): string {
  if (!facilityId) return "—";
  const record = snapshot.facilityMap.get(facilityId);
  if (!record) return facilityId;
  return `${record.name} (${record.type})`;
}

function formatQuantity(value: number): string {
  try {
    return new Intl.NumberFormat("en", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toString();
  }
}

function textCell(
  value: string,
  overrides: Record<string, unknown> = {},
): TableCell {
  return {
    text: value,
    ...overrides,
  } as TableCell;
}

function buildBatchSummary(snapshot: TraceabilitySnapshot): Content {
  const ownerDisplay = resolveFacilityName(
    snapshot,
    snapshot.batch.current_owner_facility_id,
  );

  const summaryRows: TableCell[][] = [
    [
      textCell("Product", { bold: true }),
      textCell(snapshot.batch.product_name ?? "—"),
    ],
    [
      textCell("GTIN", { bold: true }),
      textCell(snapshot.batch.gtin),
    ],
    [
      textCell("Lot", { bold: true }),
      textCell(snapshot.batch.lot),
    ],
    [
      textCell("Expiry", { bold: true }),
      textCell(snapshot.batch.expiry),
    ],
    [
      textCell("Quantity", { bold: true }),
      textCell(formatQuantity(snapshot.batch.qty)),
    ],
    [
      textCell("Current owner", { bold: true }),
      textCell(ownerDisplay),
    ],
    [
      textCell("Ledger topic", { bold: true }),
      textCell(snapshot.timeline.topicId ?? "—"),
    ],
  ];

  return {
    table: {
      widths: ["30%", "70%"],
      body: summaryRows,
    },
    layout: {
      fillColor: (rowIndex: number) =>
        rowIndex % 2 === 0 ? null : "#f5f5f5",
    },
  };
}

function buildFacilityChainSection(snapshot: TraceabilitySnapshot): Content {
  if (snapshot.facilityChain.length === 0) {
    return {
      text:
        snapshot.timeline.error ??
        snapshot.timeline.note ??
        "No custody transitions are available for this batch.",
      style: "note",
      margin: [0, 4, 0, 0],
    };
  }

  const body: TableCell[][] = [
    [
      textCell("#", { style: "tableHeader" }),
      textCell("Facility", { style: "tableHeader" }),
      textCell("Role", { style: "tableHeader" }),
      textCell("Facility Type", { style: "tableHeader" }),
      textCell("First Seen", { style: "tableHeader" }),
    ],
  ];

  snapshot.facilityChain.forEach((entry, index) => {
    const timestamp = entry.firstConsensusTimestamp
      ? formatConsensusTimestamp(entry.firstConsensusTimestamp)
      : "—";

    body.push([
      textCell((index + 1).toString()),
      textCell(entry.name),
      textCell(entry.role ?? "—"),
      textCell(entry.type ?? "—"),
      textCell(
        entry.firstSequenceNumber
          ? `Seq ${entry.firstSequenceNumber}\n${timestamp}`
          : timestamp,
      ),
    ]);
  });

  return {
    style: "tableWrapper",
    table: {
      headerRows: 1,
      widths: ["8%", "32%", "15%", "20%", "25%"],
      body,
    },
    layout: "lightHorizontalLines",
  };
}

function buildTimelineTable(snapshot: TraceabilitySnapshot): Content {
  if (snapshot.timelineEntries.length === 0) {
    const message =
      snapshot.timeline.error ??
      snapshot.timeline.note ??
      "No Hedera messages matched these batch identifiers.";

    return {
      text: message,
      style: "note",
    };
  }

  const header: TableCell[] = [
    textCell("Seq #", { style: "tableHeader" }),
    textCell("Consensus Time", { style: "tableHeader" }),
    textCell("Event", { style: "tableHeader" }),
    textCell("Actor", { style: "tableHeader" }),
    textCell("Recipient", { style: "tableHeader" }),
    textCell("Running Hash", { style: "tableHeader" }),
  ];

  const body: TableCell[][] = snapshot.timelineEntries.map((entry) => {
    const actorName = resolveFacilityName(snapshot, entry.actor.facilityId);
    const recipientName = resolveFacilityName(
      snapshot,
      entry.to?.facilityId ?? null,
    );

    return [
      textCell(entry.sequenceNumber.toString()),
      textCell(formatConsensusTimestamp(entry.consensusTimestamp)),
      textCell(entry.type),
      textCell(
        `${actorName}\nID: ${entry.actor.facilityId}\nRole: ${entry.actor.role}`,
      ),
      textCell(
        entry.to?.facilityId
          ? `${recipientName}\nID: ${entry.to.facilityId}`
          : "—",
      ),
      {
        text: entry.runningHash,
        font: "Roboto",
        fontSize: 8,
      } as TableCell,
    ];
  });

  return {
    style: "tableWrapper",
    table: {
      headerRows: 1,
      widths: ["8%", "18%", "12%", "25%", "17%", "20%"],
      body: [header, ...body],
    },
    layout: "lightHorizontalLines",
  };
}

function buildDatabaseEventsTable(snapshot: TraceabilitySnapshot): Content {
  if (snapshot.events.length === 0) {
    return {
      text: "No application events have been recorded for this batch.",
      style: "note",
    };
  }

  const header: TableCell[] = [
    textCell("Type", { style: "tableHeader" }),
    textCell("Recorded At", { style: "tableHeader" }),
    textCell("HCS Seq", { style: "tableHeader" }),
    textCell("HCS Tx", { style: "tableHeader" }),
    textCell("From", { style: "tableHeader" }),
    textCell("To", { style: "tableHeader" }),
  ];

  const body: TableCell[][] = snapshot.events.map((event) => {
    const recordedAt = new Date(event.created_at);
    const recorded =
      Number.isNaN(recordedAt.getTime()) || !event.created_at
        ? event.created_at
        : new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(recordedAt);

    return [
      textCell(event.type),
      textCell(recorded ?? "—"),
      textCell(event.hcs_seq_no?.toString() ?? "—"),
      textCell(event.hcs_tx_id ?? "—"),
      textCell(resolveFacilityName(snapshot, event.from_facility_id)),
      textCell(resolveFacilityName(snapshot, event.to_facility_id)),
    ];
  });

  return {
    style: "tableWrapper",
    table: {
      headerRows: 1,
      widths: ["12%", "23%", "10%", "20%", "17%", "18%"],
      body: [header, ...body],
    },
    layout: "lightHorizontalLines",
  };
}

function buildDocumentDefinition(
  snapshot: TraceabilitySnapshot,
): TDocumentDefinitions {
  const generatedAt = new Date(snapshot.generatedAt);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? snapshot.generatedAt
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(generatedAt);

  const content: Content[] = [
    { text: "Traceability Certificate", style: "title" },
    {
      text: `Generated ${generatedLabel} • Network: ${serverEnv.network}`,
      style: "subtitle",
    },
    {
      text: `Batch ${snapshot.batch.id}`,
      style: "batchIdentifier",
    },
    { text: "Batch Summary", style: "sectionTitle", margin: [0, 20, 0, 8] },
    buildBatchSummary(snapshot),
    {
      text: "Facility Chain",
      style: "sectionTitle",
      margin: [0, 20, 0, 8],
    },
    buildFacilityChainSection(snapshot),
    {
      text: "Hedera Custody Timeline",
      style: "sectionTitle",
      margin: [0, 20, 0, 8],
    },
    buildTimelineTable(snapshot),
    {
      text: "Application Event Ledger (Postgres)",
      style: "sectionTitle",
      margin: [0, 20, 0, 8],
    },
    buildDatabaseEventsTable(snapshot),
  ];

  if (snapshot.timeline.truncated) {
    content.push({
      text:
        snapshot.timeline.note ??
        "Timeline truncated due to report page limits. Query the API with pagination parameters for the full history.",
      style: "warning",
      margin: [0, 12, 0, 0],
    });
  } else if (snapshot.timeline.note) {
    content.push({
      text: snapshot.timeline.note,
      style: "note",
      margin: [0, 12, 0, 0],
    });
  }

  if (snapshot.timeline.error) {
    content.push({
      text: snapshot.timeline.error,
      style: "error",
      margin: [0, 12, 0, 0],
    });
  }

  return {
    info: {
      title: `Traceability Certificate - ${snapshot.batch.gtin}`,
      subject: "Pharmaceutical custody traceability",
      creator: "pack-trace",
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      lineHeight: 1.25,
    },
    styles: {
      title: {
        fontSize: 20,
        bold: true,
        margin: [0, 0, 0, 8],
      },
      subtitle: {
        fontSize: 10,
        color: "#555555",
        margin: [0, 0, 0, 16],
      },
      batchIdentifier: {
        fontSize: 12,
        bold: true,
        margin: [0, 0, 0, 12],
      },
      sectionTitle: {
        fontSize: 12,
        bold: true,
      },
      tableHeader: {
        bold: true,
        fontSize: 9,
        fillColor: "#f0f0f0",
        margin: [0, 4, 0, 4],
      },
      tableWrapper: {
        margin: [0, 0, 0, 8],
      },
      note: {
        fontSize: 9,
        color: "#555555",
      },
      warning: {
        fontSize: 9,
        color: "#995500",
      },
      error: {
        fontSize: 9,
        color: "#b3261e",
      },
    },
    content,
    pageMargins: [40, 50, 40, 60],
  };
}

export async function buildTraceabilityCertificatePdf(
  snapshot: TraceabilitySnapshot,
): Promise<Buffer> {
  const docDefinition = buildDocumentDefinition(snapshot);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    pdfDoc.on("error", (error: unknown) => {
      reject(error);
    });

    pdfDoc.end();
  });
}
