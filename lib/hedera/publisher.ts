import { SubmitTopicMessageResult, submitTopicMessage } from "./topic";
import { sha256 } from "./hash";
import { type CustodyEventPayload } from "./types";

export interface PublishCustodyEventParams {
  payload: CustodyEventPayload;
  topicId?: string;
  transactionMemo?: string;
}

export interface PublishCustodyEventResult
  extends SubmitTopicMessageResult {
  payloadHash: string;
  message: string;
  messageBytesLength: number;
}

function serializePayload(payload: unknown): string {
  return typeof payload === "string"
    ? payload
    : JSON.stringify(payload, null, 0);
}

export async function publishCustodyEvent({
  payload,
  topicId,
  transactionMemo,
}: PublishCustodyEventParams): Promise<PublishCustodyEventResult> {
  const message = serializePayload(payload);
  const metadata = await submitTopicMessage({
    topicId,
    transactionMemo,
    message,
  });

  return {
    ...metadata,
    payloadHash: sha256(message),
    message,
    messageBytesLength: Buffer.byteLength(message, "utf8"),
  };
}
