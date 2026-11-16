import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { transformer } from "@openfga/syntax-transformer";
import { fgaClient } from "../lib/fga";
import { syncTuples } from "../lib/seed";

loadEnvConfig(process.cwd());

const ENV_FILE = path.join(process.cwd(), ".env.local");

/** Key-sorted JSON without source_info, so a model read back from FGA compares equal to the one parsed from the DSL file. */
function canonical(model: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .filter(([k, x]) => k !== "source_info" && k !== "id" && x !== "" && x !== null)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  const m = model as { type_definitions: { type: string }[]; schema_version: string };
  const types = [...m.type_definitions].sort((a, b) => a.type.localeCompare(b.type));
  return JSON.stringify(sort({ schema_version: m.schema_version, type_definitions: types }));
}

/** Inserts or replaces KEY=value lines in .env.local, leaving everything else untouched. Never deletes the file. */
function upsertEnv(values: Record<string, string>) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${k}=${v}\n`;
  }
  if (existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8") === text) return; // nothing to change
  // Your credentials live here. Keep a copy of the previous contents before every edit (git-ignored via .env*).
  if (existsSync(ENV_FILE)) copyFileSync(ENV_FILE, `${ENV_FILE}.bak`);
  writeFileSync(ENV_FILE, text);
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

const STORE_HELP = `
Could not create a store with these credentials.

Auth0 FGA stores are created in the dashboard (https://dashboard.fga.dev), not through the API:
  1. Open Settings and press "Create Client" (pick the read/write/model permissions).
  2. Copy the Store ID, Client ID and Client Secret shown in the popup.
  3. Put them in .env.local as FGA_STORE_ID, FGA_CLIENT_ID and FGA_CLIENT_SECRET.
  4. Re-run: npm run setup
`;

async function main() {
  // 1. Store.
  if (!process.env.FGA_STORE_ID) {
    console.log("FGA_STORE_ID is empty: trying to create a store...");
    try {
      const created = await fgaClient({ withStore: false }).createStore({ name: "McLogix 360 FGA Workshop" });
      upsertEnv({ FGA_STORE_ID: created.id! });
      console.log(`Created store ${created.id}`);
    } catch (err) {
      console.error(STORE_HELP);
      console.error("Reason:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    console.log(`Using store ${process.env.FGA_STORE_ID}`);
  }

  // 2. Model: reuse the latest model if it is identical to fga/model.fga, otherwise write a new one.
  const dsl = readFileSync(path.join(process.cwd(), "fga", "model.fga"), "utf8");
  const wanted = transformer.transformDSLToJSON(dsl);
  const client = fgaClient({ withStore: true });
  let modelId: string | undefined;
  try {
    const latest = (await client.readLatestAuthorizationModel())?.authorization_model;
    if (latest && canonical(latest) === canonical(JSON.parse(wanted))) {
      modelId = latest.id;
      console.log(`Model unchanged, reusing ${modelId}`);
    }
  } catch {
    // no model yet
  }
  if (!modelId) {
    modelId = (await client.writeAuthorizationModel(JSON.parse(wanted))).authorization_model_id;
    console.log(`Wrote model ${modelId}`);
  }
  upsertEnv({ FGA_MODEL_ID: modelId });

  // 3. Tuples: replace everything in the store with fga/tuples.json (safe to re-run).
  const { deleted, written } = await syncTuples();
  console.log(`Tuples synced: deleted ${deleted}, wrote ${written}`);

  console.log(`\nDone. FGA_STORE_ID and FGA_MODEL_ID are saved in .env.local.\nNext: npm run dev`);
}

main().catch((err) => {
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
