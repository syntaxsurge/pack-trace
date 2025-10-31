import { spawnSync } from "node:child_process";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL environment variable.");
  process.exit(1);
}

let finalDbUrl = dbUrl;

try {
  const parsed = new URL(dbUrl);
  if (!parsed.searchParams.has("pgbouncer")) {
    parsed.searchParams.set("pgbouncer", "true");
  }
  if (!parsed.searchParams.has("statement_cache_mode")) {
    parsed.searchParams.set("statement_cache_mode", "describe");
  }
  finalDbUrl = parsed.toString();
} catch (error) {
  console.warn("Failed to parse SUPABASE_DB_URL, using raw value:", error);
}

run("pnpm", ["exec", "supabase", "db", "push", "--db-url", finalDbUrl]);
