import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { deleteTuples, readTuples, writeTuples, type Tuple } from "./fga";

export async function loadSeedTuples(): Promise<Tuple[]> {
  return JSON.parse(await readFile(path.join(process.cwd(), "fga", "tuples.json"), "utf8"));
}

/**
 * Makes FGA match fga/tuples.json: reads and deletes ALL existing tuples, then writes the seed set.
 * FGA persists across server restarts while the in-memory DB does not, so drift is expected.
 */
export async function syncTuples(): Promise<{ deleted: number; written: number }> {
  const existing = await readTuples();
  await deleteTuples(existing);
  const seed = await loadSeedTuples();
  await writeTuples(seed);
  return { deleted: existing.length, written: seed.length };
}

/** Reset & Sync: used by the UI button, POST /api/seed and `npm run seed`. */
export async function resetAndSync() {
  db.reset();
  const { deleted, written } = await syncTuples();
  return { orders: db.list().length, tuplesDeleted: deleted, tuplesWritten: written };
}
