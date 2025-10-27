import {
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
  TransactionRecord,
} from "@hashgraph/sdk";

import { serverEnv } from "@/lib/env/server";

import { getHederaClient } from "./client";

const MAX_MESSAGE_BYTES = 4096;

type MessageInput = string | Uint8Array | Buffer;

function toMessageBuffer(message: MessageInput): Buffer {
  if (typeof message === "string") {
    return Buffer.from(message, "utf8");
  }

  if (message instanceof Buffer) {
    return message;
  }

  return Buffer.from(message);
}

function assertMessageSize(bytes: Buffer) {
  if (bytes.byteLength > MAX_MESSAGE_BYTES) {
    throw new Error(
      `Hedera topic messages are limited to ${MAX_MESSAGE_BYTES} bytes. Received ${bytes.byteLength} bytes.`,
    );
  }
}

export interface TopicCreationResult {
  topicId: string;
  memo: string | null;
}

export async function createTopic(memo?: string): Promise<TopicCreationResult> {
  const client = getHederaClient();
  const sanitizedMemo = memo?.trim().slice(0, 100) ?? null;

  const topicTransaction = new TopicCreateTransaction();

  if (sanitizedMemo) {
    topicTransaction.setTopicMemo(sanitizedMemo);
  }

  const transaction = await topicTransaction.execute(client);

  const receipt = await transaction.getReceipt(client);
  const topicId = receipt.topicId?.toString();

  if (!topicId) {
    throw new Error("Topic creation did not return a Topic ID.");
  }

  return {
    topicId,
    memo: sanitizedMemo,
  };
}

export interface SubmitTopicMessageParams {
  topicId?: string;
  message: MessageInput;
  transactionMemo?: string;
}

export interface SubmitTopicMessageResult {
  topicId: string;
  transactionId: string;
  sequenceNumber: number | null;
  runningHash: string | null;
  consensusTimestamp: string | null;
  receipt: TransactionReceipt;
  record: TransactionRecord | null;
}

export async function submitTopicMessage(
  params: SubmitTopicMessageParams,
): Promise<SubmitTopicMessageResult> {
  const client = getHederaClient();
  const resolvedTopicId = params.topicId ?? serverEnv.hederaTopicId;

  if (!resolvedTopicId) {
    throw new Error(
      "No topic ID provided. Set HEDERA_TOPIC_ID or pass one to submitTopicMessage().",
    );
  }

  const topicId = TopicId.fromString(resolvedTopicId as string);
  const messageBytes = toMessageBuffer(params.message);

  assertMessageSize(messageBytes);

  const transactionMemo = (params.transactionMemo ?? "pack-trace").slice(0, 100);

  const transaction = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageBytes)
    .setTransactionMemo(transactionMemo)
    .execute(client);

  const receipt = await transaction.getReceipt(client);
  let record: TransactionRecord | null = null;

  try {
    record = await transaction.getRecord(client);
  } catch {
    record = null;
  }

  const sequenceNumber = receipt.topicSequenceNumber
    ? receipt.topicSequenceNumber.toNumber()
    : null;

  const runningHash = receipt.topicRunningHash
    ? Buffer.from(receipt.topicRunningHash).toString("base64")
    : null;

  const consensusTimestamp = record?.consensusTimestamp
    ? record.consensusTimestamp.toDate().toISOString()
    : null;

  return {
    topicId: topicId.toString(),
    transactionId: transaction.transactionId.toString(),
    sequenceNumber,
    runningHash,
    consensusTimestamp,
    receipt,
    record,
  };
}
