import {
  type FetchTopicMessagesParams,
  decodeMirrorMessagePayload,
  fetchTopicMessages,
  type MirrorTopicMessagesResponse,
} from "./mirror";
import { type CustodyEventPayload } from "./types";

export interface CustodyTimelineEntry extends CustodyEventPayload {
  consensusTimestamp: string;
  sequenceNumber: number;
  runningHash: string;
  rawMessage: string;
}

export interface CustodyTimelineResult {
  entries: CustodyTimelineEntry[];
  next: string | null | undefined;
  source: MirrorTopicMessagesResponse;
}

export async function fetchCustodyTimeline(
  topicId: string,
  params: FetchTopicMessagesParams = {},
): Promise<CustodyTimelineResult> {
  const response = await fetchTopicMessages(topicId, {
    ...params,
    encoding: params.encoding ?? "base64",
  });

  const entries: CustodyTimelineEntry[] = response.messages.map((message) => {
    const rawMessage = decodeMirrorMessagePayload(message);

    let payload: CustodyEventPayload;

    try {
      payload = JSON.parse(rawMessage) as CustodyEventPayload;
    } catch (error) {
      throw new Error(
        `Failed to parse Hedera message ${message.sequence_number}: ${(error as Error).message}`,
      );
    }

    return {
      ...payload,
      consensusTimestamp: message.consensus_timestamp,
      sequenceNumber: message.sequence_number,
      runningHash: message.running_hash,
      rawMessage,
    };
  });

  return {
    entries,
    next: response.links.next ?? null,
    source: response,
  };
}
