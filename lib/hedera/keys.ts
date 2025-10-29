import { PrivateKey } from "@hashgraph/sdk";

function normaliseHex(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed.slice(2)
    : trimmed;
}

export function parseHederaPrivateKey(rawValue: string): PrivateKey {
  const attempts: Array<() => PrivateKey> = [];
  const trimmed = rawValue.trim();

  attempts.push(() => PrivateKey.fromString(trimmed));

  const hexCandidate = normaliseHex(trimmed);

  if (/^[0-9a-fA-F]+$/.test(hexCandidate)) {
    attempts.push(() => PrivateKey.fromStringECDSA(hexCandidate));
    attempts.push(() => PrivateKey.fromStringED25519(hexCandidate));
  }

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "Unable to parse Hedera private key.",
  );
}
