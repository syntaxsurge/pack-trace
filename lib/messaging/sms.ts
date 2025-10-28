import { serverEnv } from "@/lib/env/server";

export type SmsProvider = "twilio" | "africas-talking";

export interface SmsRequest {
  to: string;
  body: string;
  provider?: SmsProvider | "auto";
  from?: string;
}

export interface SmsResult {
  provider: SmsProvider;
  status: "sent" | "queued";
  reference: string;
}

function normaliseProvider(
  requested: SmsRequest["provider"],
): SmsProvider | null {
  if (requested === "twilio") return "twilio";
  if (requested === "africas-talking") return "africas-talking";
  if (requested === "auto" || !requested) {
    if (serverEnv.twilioAccountSid && serverEnv.twilioAuthToken && serverEnv.twilioFromNumber) {
      return "twilio";
    }

    if (serverEnv.africasTalkingApiKey && serverEnv.africasTalkingUsername) {
      return "africas-talking";
    }

    return null;
  }

  return null;
}

async function sendViaTwilio(request: SmsRequest): Promise<SmsResult> {
  const accountSid = serverEnv.twilioAccountSid;
  const authToken = serverEnv.twilioAuthToken;
  const fromNumber = request.from ?? serverEnv.twilioFromNumber;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are not configured.");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({
    To: request.to,
    From: fromNumber,
    Body: request.body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Twilio message failed with ${response.status}: ${errorBody}`,
    );
  }

  const payload = (await response.json()) as { sid?: string; status?: string };

  return {
    provider: "twilio",
    status: payload.status === "sent" ? "sent" : "queued",
    reference: payload.sid ?? "twilio-message",
  };
}

async function sendViaAfricasTalking(request: SmsRequest): Promise<SmsResult> {
  const apiKey = serverEnv.africasTalkingApiKey;
  const username = serverEnv.africasTalkingUsername;

  if (!apiKey || !username) {
    throw new Error("Africa's Talking credentials are not configured.");
  }

  const params = new URLSearchParams({
    username,
    to: request.to,
    message: request.body,
  });

  if (request.from) {
    params.append("from", request.from);
  }

  const response = await fetch(
    "https://api.africastalking.com/version1/messaging",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apikey: apiKey,
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Africa's Talking message failed with ${response.status}: ${errorBody}`,
    );
  }

  const payload = (await response.json()) as {
    SMSMessageData?: { Messages?: Array<{ MessageId?: string; Status?: string }> };
  };

  const firstMessage = payload.SMSMessageData?.Messages?.[0] ?? {};
  const reference = firstMessage.MessageId ?? "africastalking-message";
  const status =
    firstMessage.Status === "Success" ? "sent" : ("queued" as const);

  return {
    provider: "africas-talking",
    status,
    reference,
  };
}

export async function sendSms(
  request: SmsRequest,
): Promise<SmsResult | null> {
  const provider = normaliseProvider(request.provider ?? "auto");

  if (!provider) {
    return null;
  }

  if (provider === "twilio") {
    return await sendViaTwilio(request);
  }

  return await sendViaAfricasTalking(request);
}
