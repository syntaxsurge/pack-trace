const MIRROR_EXPLORER_BASE: Record<string, string> = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
} as const;

export function getMirrorExplorerBase(network: string): string {
  return (
    MIRROR_EXPLORER_BASE[network as keyof typeof MIRROR_EXPLORER_BASE] ??
    MIRROR_EXPLORER_BASE.testnet
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
): string {
  const base = getMirrorExplorerBase(network);
  return `${base}/api/v1/topics/${topicId}/messages`;
}

