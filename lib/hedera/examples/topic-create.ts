/**
 * Example derived from:
 * https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message
 */
import { AccountId, Client, TopicCreateTransaction } from "@hashgraph/sdk";

import { parseHederaPrivateKey } from "@/lib/hedera/keys";

export async function exampleCreateTopic() {
  const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error("Missing Hedera operator credentials in environment.");
  }

  const client = Client.forName("testnet");
  client.setOperator(
    AccountId.fromString(operatorId),
    parseHederaPrivateKey(operatorKey),
  );

  const transaction = await new TopicCreateTransaction()
    .setTopicMemo("pack-trace example")
    .execute(client);

  const receipt = await transaction.getReceipt(client);

  return receipt.topicId?.toString();
}

async function runCli() {
  try {
    const memo = process.argv[2] ?? "pack-trace topic";
    const topicId = await exampleCreateTopic();

    if (!topicId) {
      console.log("Topic created, but no topic ID was returned.");
      return;
    }

    console.log(`Created topic ${topicId}${memo ? ` (${memo})` : ""}`);
    console.log(
      "Add this value to HEDERA_TOPIC_ID in your .env and restart the dev server.",
    );
  } catch (error) {
    console.error("Failed to create Hedera topic.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.includes("topic-create")) {
  void runCli();
}
