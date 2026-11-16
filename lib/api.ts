import { NextResponse } from "next/server";
import { errMsg, type Trace } from "./fga";

const ID = /^[a-z0-9_-]{1,64}$/;

/** DEMO ONLY: identity comes from a spoofable header (or ?user=). Production derives it from a verified token. */
export function actingUser(req: Request): string | null {
  const raw = req.headers.get("x-user-id") ?? new URL(req.url).searchParams.get("user");
  const id = raw?.trim().toLowerCase();
  return id && ID.test(id) ? id : null;
}

export const validId = (s: unknown): s is string => typeof s === "string" && ID.test(s);

export function respond(status: number, data: unknown, fga: Trace, error?: string) {
  return NextResponse.json(error ? { error, data, fga } : { data, fga }, { status });
}

export const unauthenticated = (fga: Trace) =>
  respond(401, null, fga, "Missing or invalid x-user-id header (demo identity, e.g. alice).");

/** Wraps a handler: unexpected errors (FGA unreachable, bad credentials) become a 502 that still carries the trace. */
export async function guarded(trace: Trace, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return respond(502, null, trace, `FGA error: ${errMsg(err)}`);
  }
}
