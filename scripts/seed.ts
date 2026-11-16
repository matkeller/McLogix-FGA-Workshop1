import { loadEnvConfig } from "@next/env";
import { resetAndSync } from "../lib/seed";

loadEnvConfig(process.cwd());

resetAndSync()
  .then((r) => console.log(`Reset & Sync complete: deleted ${r.tuplesDeleted} tuples, wrote ${r.tuplesWritten}.`))
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
