/**
 * Example derived from:
 * https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/define-a-token
 */
import {
  AccountId,
  Client,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
} from "@hashgraph/sdk";

import { parseHederaPrivateKey } from "@/lib/hedera/keys";

export async function exampleCreateNftToken() {
  const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("Missing Hedera operator credentials in environment.");
  }

  const client = Client.forName("testnet");
  const parsedKey = parseHederaPrivateKey(operatorKey);

  client.setOperator(AccountId.fromString(operatorId), parsedKey);

  const transaction = await new TokenCreateTransaction()
    .setTokenName("Pack Traceability Token")
    .setTokenSymbol("PACK")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(10_000)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .freezeWith(client)
    .sign(parsedKey);

  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);

  return receipt.tokenId?.toString();
}
