import { getMqttClient } from "./mqtt-client";
import { suposConfig } from "./config";

export async function publishToSupos(topic: string, payload: unknown) {
  if (!suposConfig.enabled) {
    return;
  }

  const client = getMqttClient();
  const message = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    client.publish(
      topic,
      message,
      { qos: suposConfig.qos },
      (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}
