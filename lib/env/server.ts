import { z } from "zod";

import { clientEnv } from "./client";

const serverSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  HEDERA_OPERATOR_ACCOUNT_ID: z.string().optional(),
  HEDERA_OPERATOR_DER_PRIVATE_KEY: z.string().optional(),
  HEDERA_TOPIC_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_USERNAME: z.string().optional(),
  DEMO_SEED_PASSWORD: z.string().optional(),
});

const parsed = serverSchema.parse(process.env);

export const serverEnv = {
  supabaseUrl: parsed.SUPABASE_URL ?? clientEnv.supabaseUrl,
  supabaseAnonKey: parsed.SUPABASE_ANON_KEY ?? clientEnv.supabaseAnonKey,
  supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  hederaOperatorAccountId: parsed.HEDERA_OPERATOR_ACCOUNT_ID ?? null,
  hederaOperatorDerPrivateKey: parsed.HEDERA_OPERATOR_DER_PRIVATE_KEY ?? null,
  hederaTopicId: parsed.HEDERA_TOPIC_ID ?? null,
  twilioAccountSid: parsed.TWILIO_ACCOUNT_SID ?? null,
  twilioAuthToken: parsed.TWILIO_AUTH_TOKEN ?? null,
  twilioFromNumber: parsed.TWILIO_FROM_NUMBER ?? null,
  africasTalkingApiKey: parsed.AT_API_KEY ?? null,
  africasTalkingUsername: parsed.AT_USERNAME ?? null,
  network: clientEnv.network,
  demoSeedPassword: parsed.DEMO_SEED_PASSWORD ?? null,
} as const;
