import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";

export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
