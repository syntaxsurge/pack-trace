/**
 * Example derived from:
 * https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message
 */
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
} from "@hashgraph/sdk";

export async function exampleCreateTopic() {
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

  const transaction = await new TopicCreateTransaction()
    .setTopicMemo("pack-trace example")
    .execute(client);

  const receipt = await transaction.getReceipt(client);

  return receipt.topicId?.toString();
}

