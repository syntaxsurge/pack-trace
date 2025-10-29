import bwipjs from "bwip-js";
import type { Content, ContentImage, TDocumentDefinitions } from "pdfmake/interfaces";

import { getPdfPrinter } from "@/lib/pdf/printer";
import type { Gs1DatamatrixPayload } from "./gs1";

async function renderDatamatrixPng(payload: Gs1DatamatrixPayload): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      bwipjs.toBuffer(
        {
          bcid: "gs1datamatrix",
          text: payload.humanReadable,
          scale: 6,
          paddingwidth: 6,
          paddingheight: 6,
          includetext: false,
          backgroundcolor: "FFFFFF",
        },
        (error: Error | null, png: Buffer | undefined) => {
          if (error || !png) {
            reject(error ?? new Error("Failed to render GS1 DataMatrix."));
            return;
          }

          resolve(png);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

function buildDocumentDefinition(params: {
  payload: Gs1DatamatrixPayload;
  productName: string;
  quantity: number | null;
  facilityName?: string | null;
}): { definition: TDocumentDefinitions; imagePlaceholder: { image: string } } {
  const { payload, productName, quantity, facilityName } = params;
  const lines = [
    productName.trim() || payload.gtin14,
    payload.humanReadable,
    quantity ? `Quantity: ${new Intl.NumberFormat("en").format(quantity)}` : null,
    facilityName ? `Facility: ${facilityName}` : null,
  ].filter(Boolean) as string[];

  const imagePlaceholder: ContentImage = {
    image: "",
    width: 180,
    alignment: "center",
    margin: [0, 0, 0, 12],
  };

  const content: Content[] = [
    {
      text: lines,
      alignment: "center",
      margin: [0, 0, 0, 16],
      fontSize: 11,
    },
    imagePlaceholder,
    {
      text: "pack-trace GS1 DataMatrix",
      alignment: "center",
      fontSize: 8,
      color: "#555555",
    },
  ];

  const definition: TDocumentDefinitions = {
    pageSize: { width: 240, height: 320 },
    pageMargins: [24, 24, 24, 24],
    content,
    defaultStyle: {
      font: "Roboto",
    },
  };

  return { definition, imagePlaceholder };
}

export interface BuildBatchLabelPdfParams {
  payload: Gs1DatamatrixPayload;
  productName: string;
  quantity: number | null;
  facilityName?: string | null;
}

export async function buildBatchLabelPdf(
  params: BuildBatchLabelPdfParams,
): Promise<Buffer> {
  const png = await renderDatamatrixPng(params.payload);
  const { definition, imagePlaceholder } = buildDocumentDefinition(params);
  imagePlaceholder.image = `data:image/png;base64,${png.toString("base64")}`;

  const printer = getPdfPrinter();
  const pdfDoc = printer.createPdfKitDocument(definition);
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", (error: unknown) => reject(error));
    pdfDoc.end();
  });
}
