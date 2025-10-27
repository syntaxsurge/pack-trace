import { z } from "zod";

const LOT_PATTERN = /^[A-Za-z0-9\-_.+/]{1,20}$/;

export const batchLabelInputSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "Enter the product name.")
    .max(100, "Product name must be 100 characters or fewer."),
  gtin: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, "GTIN must be 8, 12, 13, or 14 digits."),
  lot: z
    .string()
    .trim()
    .regex(LOT_PATTERN, "Lot must be 1-20 characters (letters, numbers, -_.+/)."),
  expiry: z
    .string()
    .trim()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Expiry must be a valid ISO date (YYYY-MM-DD).",
    ),
  quantity: z.coerce
    .number({
      invalid_type_error: "Enter a numeric quantity.",
    })
    .int("Quantity must be a whole number.")
    .positive("Quantity must be greater than zero.")
    .max(1_000_000, "Quantity must be less than 1,000,000."),
});

export type BatchLabelInput = z.infer<typeof batchLabelInputSchema>;

export interface Gs1DatamatrixPayload {
  gtin: string;
  gtin14: string;
  lot: string;
  expiryIsoDate: string;
  expiryYyMmDd: string;
  machineReadable: string;
  humanReadable: string;
}

function normalizeGtin(gtin: string): string {
  if (!/^\d{8,14}$/.test(gtin)) {
    throw new Error("GTIN must contain only digits (8, 12, 13, or 14 characters).");
  }

  if (gtin.length === 14) {
    return gtin;
  }

  return gtin.padStart(14, "0");
}

function parseExpiryDate(expiry: string): { isoDate: string; yyMmDd: string } {
  const match = expiry.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error("Expiry value must use YYYY-MM-DD.");
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(date.getTime())) {
    throw new Error("Expiry date is invalid.");
  }

  return {
    isoDate: `${year}-${month}-${day}`,
    yyMmDd: `${year.slice(-2)}${month}${day}`,
  };
}

export function buildGs1DatamatrixPayload(
  input: BatchLabelInput,
): Gs1DatamatrixPayload {
  const parsed = batchLabelInputSchema.parse(input);
  const gtin14 = normalizeGtin(parsed.gtin);
  const expiry = parseExpiryDate(parsed.expiry);

  const machineReadable = `01${gtin14}10${parsed.lot}\u001d17${expiry.yyMmDd}`;
  const humanReadable = `(01)${gtin14}(10)${parsed.lot}(17)${expiry.yyMmDd}`;

  return {
    gtin: parsed.gtin,
    gtin14,
    lot: parsed.lot,
    expiryIsoDate: expiry.isoDate,
    expiryYyMmDd: expiry.yyMmDd,
    machineReadable,
    humanReadable,
  };
}

