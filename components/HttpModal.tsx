"use client";

import { useEffect, useState } from "react";

/** The exact HTTP exchange the browser made against this app's REST API. */
export type HttpExchange = {
  request: { method: string; url: string; headers: Record<string, string>; body?: string };
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; ms: number };
};

const pretty = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function toCurl({ request: r }: HttpExchange): string {
  const parts = [`curl -i -X ${r.method} ${q(r.url)}`];
  for (const [k, v] of Object.entries(r.headers)) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (r.body) parts.push(`-d ${q(JSON.stringify(JSON.parse(r.body)))}`);
  return parts.join(" \\\n  ");
}

const statusColor = (s: number) =>
  s < 300 ? "text-green-700 dark:text-green-400" : s < 500 ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400";

const Headers = ({ headers }: { headers: Record<string, string> }) => (
  <>
    {Object.entries(headers).map(([k, v]) => (
      <div key={k}>
        <span className="text-sky-700 dark:text-sky-300">{k}</span>: {v}
      </div>
    ))}
  </>
);

type Explanation = { headline: string; points: string[]; where: string };

/** Who produced what in this exchange. Drift-proof: points at the handler, not at line numbers (README has verified lines). */
function explain({ request: req, response: res }: HttpExchange): Explanation {
  const path = new URL(req.url).pathname;
  const one = /^\/api\/orders\/[^/]+$/.test(path);
  let body: { fga?: { call: string; allowed: boolean | null }[] } = {};
  try { body = JSON.parse(res.body); } catch {}
  const decision = body.fga?.find((e) => e.call === "check")?.allowed;
  const file = one ? "app/api/orders/[id]/route.ts" : path === "/api/seed" ? "app/api/seed/route.ts" : "app/api/orders/route.ts";
  const where = `See the ${req.method} handler in ${file}`;

  if (path === "/api/seed")
    return { headline: "Not an authorization decision: this is setup plumbing", points: ["Reset & Sync resets the database and replaces all FGA tuples with fga/tuples.json. No check is made (demo only: unauthenticated and destructive)."], where };
  if (res.status === 401)
    return { headline: "Rejected by the API layer before FGA was asked", points: ["No usable x-user-id header, so there is no user to ask FGA about. The fga array is empty."], where };
  if (res.status === 400)
    return { headline: "Rejected by the API layer's own validation", points: ["The request body failed validation, so FGA was not asked or not needed."], where };
  if (res.status === 404)
    return { headline: "The API layer looked in OUR database: no such order", points: ["FGA only stores relationships and cannot say whether an order exists, so the database is asked first.", "FGA was never called: the fga array is empty."], where };
  if (res.status === 403)
    return {
      headline: "FGA said NO. The API layer turned that into a 403.",
      points: [
        `FGA's whole answer is in the fga array: allowed: ${String(decision)}. That is all FGA knows.`,
        "The API layer stops here: no order data is read into the response. The row stays in the database.",
        "The caller only sees 403. It never talks to FGA and does not know FGA exists.",
      ],
      where,
    };
  if (res.status === 502)
    return { headline: "An FGA step failed, so the API layer rolled back", points: ["The database and FGA are two systems that cannot be updated atomically. See the compensate entry in the fga array: the database change was undone."], where };
  if (req.method === "GET" && !one)
    return { headline: "FGA returned ids. The database supplied everything else.", points: ["listObjects returned only object ids (see the log note, e.g. order:1001).", "The API layer looked each id up in OUR database to fill in item, quantity and status."], where };
  if (req.method === "POST")
    return { headline: "FGA allowed it. The database stored the order.", points: ["FGA's check on the supplier said allowed: true, nothing more.", "The item and quantity were saved in OUR database. FGA was then told only ids and relationships (two tuples)."], where };
  if (req.method === "DELETE")
    return { headline: "FGA allowed it. The API layer deleted from the database and cleaned up FGA.", points: ["FGA said allowed: true, nothing more.", "The order row was removed from OUR database, then its relationship tuples were removed from FGA."], where };
  if (req.method === "PATCH")
    return { headline: "FGA allowed it. The change was applied to the database.", points: ["FGA said allowed: true, nothing more.", "The new status/quantity was written to OUR database. FGA never sees it."], where };
  return {
    headline: "FGA said YES. The order details came from OUR database.",
    points: [
      `FGA's whole answer is in the fga array: allowed: ${String(decision)}. It contains no item, quantity or status.`,
      "The item, quantity and status in the response body were read from the application's database by the API layer.",
    ],
    where,
  };
}

const pre = "whitespace-pre-wrap break-words overflow-x-auto rounded bg-slate-100 p-3 font-mono text-xs leading-relaxed dark:bg-slate-950";

function ExplainBox({ exchange }: { exchange: HttpExchange }) {
  const e = explain(exchange);
  return (
    <div className="mx-4 mb-4 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
      <div className="text-xs font-semibold uppercase text-indigo-800 dark:text-indigo-300">Who produced what?</div>
      <div className="mt-1 font-semibold">{e.headline}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-300">
        {e.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">{e.where}, where the response is built. The README lists exact line numbers.</div>
    </div>
  );
}

export function HttpModal({ title, exchange, onClose }: { title: string; exchange: HttpExchange; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { request: req, response: res } = exchange;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(toCurl(exchange));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="HTTP request and response"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h3 className="font-semibold">HTTP request and response</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copy} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              {copied ? "Copied!" : "Copy as curl"}
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              Close (Esc)
            </button>
          </div>
        </header>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Request</h4>
            <pre className={pre}>
              <div className="font-bold">
                <span className="text-indigo-700 dark:text-indigo-300">{req.method}</span> {req.url}
              </div>
              <Headers headers={req.headers} />
              {req.body && <div className="mt-3 whitespace-pre-wrap">{pretty(req.body)}</div>}
            </pre>
          </section>
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Response ({res.ms} ms)</h4>
            <pre className={pre}>
              <div className={`font-bold ${statusColor(res.status)}`}>
                HTTP {res.status} {res.statusText}
              </div>
              <Headers headers={res.headers} />
              <div className="mt-3 whitespace-pre-wrap">{pretty(res.body)}</div>
            </pre>
          </section>
        </div>

        <ExplainBox exchange={exchange} />

        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          This is the REST call the browser made to this app&apos;s own API (the browser also adds headers such as Host and User-Agent).
          The <code>fga</code> array in the response body is the trace of the Auth0 FGA calls the server made while handling it, which is
          what the log entries above show. <strong>DEMO ONLY:</strong> <code>x-user-id</code> is a spoofable identity header.
        </p>
      </div>
    </div>
  );
}
