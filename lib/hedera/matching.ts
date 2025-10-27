import type { CustodyTimelineEntry } from "./timeline";

export interface BatchIdentifiers {
  gtin: string;
  lot: string;
  expiry: string;
}

export function matchesBatchIdentifier(
  entry: CustodyTimelineEntry,
  identifiers: BatchIdentifiers,
): boolean {
  return (
    entry.batch.gtin === identifiers.gtin &&
    entry.batch.lot === identifiers.lot &&
    entry.batch.exp === identifiers.expiry
  );
}

export function filterTimelineEntriesByBatch(
  entries: CustodyTimelineEntry[],
  identifiers: BatchIdentifiers,
): CustodyTimelineEntry[] {
  return entries.filter((entry) => matchesBatchIdentifier(entry, identifiers));
}

