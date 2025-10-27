/**
 * Example derived from:
 * https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message
 */
import {
  AccountId,
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";

export async function exampleSubmitMessage(topicId: string, message: string) {
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

  const transaction = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .execute(client);

  const receipt = await transaction.getReceipt(client);
  const record = await transaction.getRecord(client);

  return {
    consensusTimestamp:
      record.consensusTimestamp?.toDate().toISOString() ?? null,
    sequenceNumber: receipt.topicSequenceNumber?.toNumber() ?? null,
  };
}
