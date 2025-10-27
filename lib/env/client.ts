import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_NETWORK: z
    .enum(["mainnet", "testnet", "previewnet"])
    .optional()
    .default("testnet"),
});

const parsed = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK ?? "testnet",
});

export const clientEnv = {
  supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  network: parsed.NEXT_PUBLIC_NETWORK,
} as const;

