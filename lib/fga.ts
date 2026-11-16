import {
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
  ConsistencyPreference,
  CredentialsMethod,
  OpenFgaClient,
  type TupleKey,
} from "@openfga/sdk";

// This module is the ONLY place that talks to Auth0 FGA. Note what it accepts: users, relations and object ids.
// Order details (item, quantity, status) never reach FGA. They live in lib/db.ts.
export type Tuple = { user: string; relation: string; object: string };

/** One line of the FGA check log. Returned in every API response and rendered by the UI. */
export type FgaTrace = {
  call: string; // check | listObjects | write | delete | read | compensate
  user: string;
  relation: string;
  object: string;
  allowed: boolean | null; // null for calls that are not a yes/no decision
  consistency: "HIGHER_CONSISTENCY" | "MINIMIZE_LATENCY";
  ms: number;
  note?: string;
};

export type Trace = FgaTrace[];

/** FGA_HIGHER_CONSISTENCY defaults to true for the workshop. See README "Consistency". */
export function consistencyMode(): "HIGHER_CONSISTENCY" | "MINIMIZE_LATENCY" {
  return process.env.FGA_HIGHER_CONSISTENCY === "false" ? "MINIMIZE_LATENCY" : "HIGHER_CONSISTENCY";
}

function consistencyOpt() {
  return {
    consistency:
      consistencyMode() === "HIGHER_CONSISTENCY"
        ? ConsistencyPreference.HigherConsistency
        : ConsistencyPreference.MinimizeLatency,
  };
}

let cached: { key: string; client: OpenFgaClient } | undefined;

/** Builds an Auth0 FGA client from environment variables. Env is read on each call so `npm run setup` can update it. */
export function fgaClient(opts: { withStore?: boolean } = {}): OpenFgaClient {
  const { withStore = true } = opts;
  const apiUrl = process.env.FGA_API_URL;
  if (!apiUrl) throw new Error("FGA_API_URL is not set. Copy .env.example to .env.local and fill in your Auth0 FGA credentials.");
  const storeId = withStore ? process.env.FGA_STORE_ID || undefined : undefined;
  if (withStore && !storeId) throw new Error("FGA_STORE_ID is not set. Run `npm run setup`.");
  const modelId = withStore ? process.env.FGA_MODEL_ID || undefined : undefined;

  const key = [apiUrl, storeId, modelId, process.env.FGA_CLIENT_ID, process.env.FGA_CLIENT_SECRET].join("|");
  if (cached?.key === key) return cached.client;

  const { FGA_CLIENT_ID: clientId, FGA_CLIENT_SECRET: clientSecret } = process.env;
  const client = new OpenFgaClient({
    apiUrl,
    storeId,
    authorizationModelId: modelId, // pinned by `npm run setup`
    // Auth0 FGA authenticates with client credentials. Credentials are only skipped when none
    // are supplied, which is how automated tests run.
    ...(clientId && clientSecret
      ? {
          credentials: {
            method: CredentialsMethod.ClientCredentials,
            config: {
              apiTokenIssuer: process.env.FGA_API_TOKEN_ISSUER ?? "auth.fga.dev",
              apiAudience: process.env.FGA_API_AUDIENCE ?? "",
              clientId,
              clientSecret,
            },
          },
        }
      : {}),
  });
  cached = { key, client };
  return client;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - t) };
}

/** check(user, relation, object): records the decision in the trace and returns it. */
export async function check(trace: Trace, user: string, relation: string, object: string): Promise<boolean> {
  const { result, ms } = await timed(() => fgaClient().check({ user, relation, object }, consistencyOpt()));
  const allowed = result.allowed === true;
  trace.push({ call: "check", user, relation, object, allowed, consistency: consistencyMode(), ms });
  return allowed;
}

/** listObjects(user, relation, type): the list-filtering pattern. Returns full object ids (e.g. "order:1001"). */
export async function listObjects(trace: Trace, user: string, relation: string, type: string): Promise<string[]> {
  const { result, ms } = await timed(() => fgaClient().listObjects({ user, relation, type }, consistencyOpt()));
  const objects = result.objects ?? [];
  trace.push({
    call: "listObjects", user, relation, object: type, allowed: objects.length > 0,
    consistency: consistencyMode(), ms, note: objects.length ? objects.join(", ") : "no objects",
  });
  return objects;
}

/** Reads every tuple in the store, optionally narrowed to one object. */
export async function readTuples(object?: string): Promise<Tuple[]> {
  const out: Tuple[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await fgaClient().read(object ? ({ object } as TupleKey) : {}, {
      pageSize: 100,
      continuationToken,
      ...consistencyOpt(),
    });
    for (const t of res.tuples ?? []) out.push({ user: t.key.user, relation: t.key.relation, object: t.key.object });
    continuationToken = res.continuation_token || undefined;
  } while (continuationToken);
  return out;
}

const CHUNK = 50;

export async function writeTuples(tuples: Tuple[]): Promise<void> {
  for (let i = 0; i < tuples.length; i += CHUNK) {
    await fgaClient().write(
      { writes: tuples.slice(i, i + CHUNK) },
      { conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore } },
    );
  }
}

export async function deleteTuples(tuples: Tuple[]): Promise<void> {
  for (let i = 0; i < tuples.length; i += CHUNK) {
    await fgaClient().write(
      { deletes: tuples.slice(i, i + CHUNK) },
      { conflict: { onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore } },
    );
  }
}

/** Writes the two tuples that make an order authorizable, and records it in the trace. */
export async function writeOrderTuples(
  trace: Trace,
  orderId: string,
  supplierId: string,
  userId: string,
): Promise<void> {
  const object = `order:${orderId}`;
  const tuples: Tuple[] = [
    { user: `supplier:${supplierId}`, relation: "supplier", object },
    { user: `user:${userId}`, relation: "placed_by", object },
  ];
  const { ms } = await timed(async () => {
    await writeTuples(tuples);
  }).catch((err) => {
    trace.push({ call: "write", user: tuples[0].user, relation: "supplier + placed_by", object, allowed: null, consistency: consistencyMode(), ms: 0, note: `FAILED: ${errMsg(err)}` });
    throw err;
  });
  for (const t of tuples) trace.push({ call: "write", ...t, allowed: null, consistency: consistencyMode(), ms });
}

/** Deletes every tuple that has this order as its object. */
export async function deleteOrderTuples(
  trace: Trace,
  orderId: string,
): Promise<void> {
  const object = `order:${orderId}`;
  try {
    const { result: tuples, ms } = await timed(async () => {
      const existing = await readTuples(object);
      await deleteTuples(existing);
      return existing;
    });
    for (const t of tuples) trace.push({ call: "delete", ...t, allowed: null, consistency: consistencyMode(), ms });
  } catch (err) {
    trace.push({ call: "delete", user: "*", relation: "*", object, allowed: null, consistency: consistencyMode(), ms: 0, note: `FAILED: ${errMsg(err)}` });
    throw err;
  }
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
