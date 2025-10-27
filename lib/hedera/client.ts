import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

import { serverEnv } from "@/lib/env/server";

declare global {
  // eslint-disable-next-line no-var
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

  const operatorId = serverEnv.hederaOperatorId;
  const operatorKey = serverEnv.hederaOperatorKey;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "Hedera operator credentials are not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.",
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

