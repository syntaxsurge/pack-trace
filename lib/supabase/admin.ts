import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";

export function createAdminClient() {
  if (!serverEnv.supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Provide it via environment variables at runtime.",
    );
  }

  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
