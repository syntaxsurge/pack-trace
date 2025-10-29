const MIRROR_EXPLORER_BASE: Record<string, string> = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
} as const;

const HASHSCAN_BASE: Record<string, string> = {
  mainnet: "https://hashscan.io/#/mainnet",
  testnet: "https://hashscan.io/#/testnet",
  previewnet: "https://hashscan.io/#/previewnet",
} as const;

export function getMirrorExplorerBase(network: string): string {
  return (
    MIRROR_EXPLORER_BASE[network as keyof typeof MIRROR_EXPLORER_BASE] ??
    MIRROR_EXPLORER_BASE.testnet
  );
}

export function getHashscanBase(network: string): string {
  return (
    HASHSCAN_BASE[network as keyof typeof HASHSCAN_BASE] ??
    HASHSCAN_BASE.testnet
  );
}

export function buildMirrorMessageUrl(
  network: string,
  topicId: string,
  sequenceNumber: number,
): string {
  const base = getMirrorExplorerBase(network);
  return `${base}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
}

export function buildMirrorTopicUrl(
  network: string,
  topicId: string,
  params?: {
    order?: "asc" | "desc";
    limit?: number;
    timestamp?: string;
  },
): string {
  const base = getMirrorExplorerBase(network);
  const url = new URL(`/api/v1/topics/${topicId}/messages`, base);

  if (params?.order) {
    url.searchParams.set("order", params.order);
  }

  if (typeof params?.limit === "number") {
    url.searchParams.set("limit", params.limit.toString());
  }

  if (params?.timestamp) {
    url.searchParams.set("timestamp", params.timestamp);
  }

  return url.toString();
}

export function buildHashscanTopicUrl(
  network: string,
  topicId: string,
): string {
  const base = getHashscanBase(network);
  return `${base}/topic/${topicId}`;
}

export function buildHashscanMessageUrl(
  network: string,
  topicId: string,
  sequenceNumber: number,
): string {
  const base = getHashscanBase(network);
  return `${base}/topic/${topicId}/message/${sequenceNumber}`;
}
