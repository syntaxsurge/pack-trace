import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

import { serverEnv } from "@/lib/env/server";

declare global {
  var __hederaClient: Client | undefined;
}

const NETWORK_NAME_MAP = {
  mainnet: "mainnet",
  testnet: "testnet",
  previewnet: "previewnet",
} as const;

function ensureServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Hedera client is only available on the server runtime.");
  }
}

function createClient(): Client {
  ensureServerRuntime();

  const operatorId = serverEnv.hederaOperatorAccountId;
  const operatorKey = serverEnv.hederaOperatorPrivateKey;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "Hedera operator credentials are not configured. Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY.",
    );
  }

  const networkName = NETWORK_NAME_MAP[serverEnv.network] ?? "testnet";

  const client = Client.forName(networkName);

  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey),
  );

  return client;
}

export function getHederaClient(): Client {
  ensureServerRuntime();

  if (!globalThis.__hederaClient) {
    globalThis.__hederaClient = createClient();
  }

  return globalThis.__hederaClient;
}
