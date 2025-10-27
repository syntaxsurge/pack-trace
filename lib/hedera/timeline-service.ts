import {
  fetchCustodyTimeline,
  type CustodyTimelineEntry,
} from "./timeline";
import {
  filterTimelineEntriesByBatch,
  matchesBatchIdentifier,
  type BatchIdentifiers,
} from "./matching";

export interface LoadBatchTimelineParams {
  topicId: string;
  identifiers: BatchIdentifiers;
  cursor?: string | null;
  limit?: number;
  order?: "asc" | "desc";
}

export interface LoadBatchTimelineResult {
  entries: CustodyTimelineEntry[];
  nextCursor: string | null;
  note: string | null;
  error: string | null;
}

export async function loadBatchTimeline({
  topicId,
  identifiers,
  cursor,
  limit = 25,
  order = "desc",
}: LoadBatchTimelineParams): Promise<LoadBatchTimelineResult> {
  try {
    const response = await fetchCustodyTimeline(
      topicId,
      cursor ? { next: cursor } : { limit, order },
    );

    const filtered = filterTimelineEntriesByBatch(response.entries, identifiers);
    let note: string | null = null;

    if (filtered.length === 0) {
      const hasOtherMatches = response.entries.some((entry) =>
        matchesBatchIdentifier(entry, identifiers),
      );

      if (hasOtherMatches) {
        note =
          "No Hedera messages for these identifiers appear on this page. Load older entries to continue.";
      } else {
        note =
          "No Hedera messages were found for these identifiers in the configured topic.";
      }
    }

    return {
      entries: filtered,
      nextCursor: response.next ?? null,
      note,
      error: null,
    };
  } catch (error) {
    return {
      entries: [],
      nextCursor: null,
      note: null,
      error: (error as Error).message,
    };
  }
}

