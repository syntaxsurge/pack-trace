/**
 * Example derived from:
 * https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/define-a-token
 */
import {
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
} from "@hashgraph/sdk";

export async function exampleCreateNftToken() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("Missing Hedera operator credentials in environment.");
  }

  const client = Client.forName("testnet");
  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey),
  );

  const transaction = await new TokenCreateTransaction()
    .setTokenName("Pack Traceability Token")
    .setTokenSymbol("PACK")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(10_000)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .freezeWith(client)
    .sign(PrivateKey.fromString(operatorKey));

  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);

  return receipt.tokenId?.toString();
}

