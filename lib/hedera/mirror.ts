import { serverEnv } from "@/lib/env/server";

const MIRROR_BASE_URL: Record<string, string> = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};

export interface MirrorTopicMessage {
  consensus_timestamp: string;
  message: string;
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  chunk_info?: {
    initial_transaction_id: {
      account_id: string;
      nonce: number;
      scheduled: boolean;
      transaction_valid_start: string;
    };
    number: number;
    total: number;
  } | null;
}

export interface MirrorTopicMessagesResponse {
  messages: MirrorTopicMessage[];
  links: {
    next?: string | null;
  };
}

export interface FetchTopicMessagesParams {
  limit?: number;
  order?: "asc" | "desc";
  timestamp?: string;
  encoding?: "base64" | "utf-8";
  next?: string | null;
}

function getMirrorBaseUrl(): string {
  return MIRROR_BASE_URL[serverEnv.network] ?? MIRROR_BASE_URL.testnet;
}

function buildMirrorUrl(
  topicId: string,
  params: FetchTopicMessagesParams,
): URL {
  const base = getMirrorBaseUrl();

  if (params.next) {
    return params.next.startsWith("http")
      ? new URL(params.next)
      : new URL(params.next, base);
  }

  const url = new URL(`/api/v1/topics/${topicId}/messages`, base);

  if (params.limit) {
    url.searchParams.set("limit", params.limit.toString());
  }

  if (params.order) {
    url.searchParams.set("order", params.order);
  }

  if (params.timestamp) {
    url.searchParams.set("timestamp", params.timestamp);
  }

  if (params.encoding) {
    url.searchParams.set("encoding", params.encoding);
  }

  return url;
}

export async function fetchTopicMessages(
  topicId: string,
  params: FetchTopicMessagesParams = {},
): Promise<MirrorTopicMessagesResponse> {
  const url = buildMirrorUrl(topicId, params);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Mirror node request failed (${response.status}): ${errorBody}`,
    );
  }

  return (await response.json()) as MirrorTopicMessagesResponse;
}

export function decodeMirrorMessagePayload(message: MirrorTopicMessage): string {
  return Buffer.from(message.message, "base64").toString("utf8");
}

export function parseMirrorMessagePayload<T>(
  message: MirrorTopicMessage,
): T {
  const decoded = decodeMirrorMessagePayload(message);

  try {
    return JSON.parse(decoded) as T;
  } catch (error) {
    throw new Error(
      `Unable to parse mirror message payload as JSON: ${(error as Error).message}`,
    );
  }
}

