import { guarded, respond } from "@/lib/api";
import type { Trace } from "@/lib/fga";
import { resetAndSync } from "@/lib/seed";

export const dynamic = "force-dynamic";

// DEMO ONLY: unauthenticated and destructive. Resets the DB and replaces ALL tuples in the store.
export async function POST() {
  const trace: Trace = [];
  return guarded(trace, async () => respond(200, await resetAndSync(), trace));
}
