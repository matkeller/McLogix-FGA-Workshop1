"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/components/Banner";
import { CheckLog, type LogGroup } from "@/components/CheckLog";
import { HowToRead } from "@/components/HowToRead";
import { HttpModal } from "@/components/HttpModal";
import { OrderTable } from "@/components/OrderTable";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Order } from "@/lib/db";
import { PERSONAS, SUPPLIER_IDS } from "@/lib/personas";

const box = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
const input =
  "rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const primary = "rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700";

export default function Home() {
  const [personaId, setPersonaId] = useState("alice");
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const [orders, setOrders] = useState<Order[]>([]);
  const [groups, setGroups] = useState<LogGroup[]>([]);
  const [viewing, setViewing] = useState<LogGroup | null>(null);
  const [message, setMessage] = useState("");
  const [supplier, setSupplier] = useState("supplier_a");
  const [item, setItem] = useState("Orange juice");
  const [quantity, setQuantity] = useState(10);
  const [directId, setDirectId] = useState("1001");

  // Every action goes to the real API so the log shows real FGA decisions. Nothing is hidden or faked client-side.
  const call = useCallback(
    async (method: string, path: string, body?: unknown, clearMessage = true) => {
      const headers: Record<string, string> = {
        ...(body ? { "content-type": "application/json" } : {}),
        "x-user-id": personaId,
      };
      const reqBody = body ? JSON.stringify(body) : undefined;
      const t0 = performance.now();
      const res = await fetch(path, { method, headers, body: reqBody });
      const text = await res.text();
      const ms = Math.round(performance.now() - t0);
      const json = JSON.parse(text);
      setGroups((g) => [
        {
          id: Date.now() + Math.random(),
          label: `${personaId}: ${method} ${path}`,
          status: res.status,
          fga: json.fga ?? [],
          http: {
            request: { method, url: `${location.origin}${path}`, headers, body: reqBody },
            response: { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers), body: text, ms },
          },
        },
        ...g,
      ]);
      if (!res.ok) setMessage(json.error ?? `HTTP ${res.status}`);
      else if (clearMessage) setMessage("");
      return { status: res.status, json };
    },
    [personaId],
  );

  const refresh = useCallback(async () => {
    const { status, json } = await call("GET", "/api/orders", undefined, false);
    setOrders(status === 200 ? json.data : []);
  }, [call]);

  // Switching persona re-lists orders and resets the supplier dropdown to the persona's home supplier.
  useEffect(() => {
    setSupplier(persona.homeSupplier ?? "supplier_a");
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  const place = async () => {
    await call("POST", "/api/orders", { supplierId: supplier, item, quantity });
    await refresh();
  };
  const view = (id: string) => call("GET", `/api/orders/${id}`);
  const update = async (id: string, status: string) => {
    await call("PATCH", `/api/orders/${id}`, { status });
    await refresh();
  };
  const remove = async (id: string) => {
    await call("DELETE", `/api/orders/${id}`);
    await refresh();
  };
  const reset = async () => {
    await call("POST", "/api/seed");
    await refresh();
  };

  return (
    <>
      <Banner />
      <nav className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="font-semibold">McLogix 360 <span className="font-normal text-slate-500 dark:text-slate-400">· Auth0 FGA workshop</span></h1>
        <div className="flex items-center gap-4">
          <PersonaSwitcher persona={persona} onChange={setPersonaId} />
          <ThemeToggle />
        </div>
      </nav>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[3fr_2fr]">
        <HowToRead />
        <div className="space-y-4">
          {message && <p role="status" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{message}</p>}

          <section className={box}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Orders <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(filtered by FGA listObjects)</span></h2>
              <div className="group relative">
                <button className={primary} onClick={reset} aria-describedby="reset-help">Reset &amp; Sync</button>
                <div
                  id="reset-help"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <div className="mb-1 font-semibold">Resets the demo to its starting state</div>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>The in-memory database goes back to the 4 seed orders (1001-1004). Orders you placed, changed or deleted are discarded.</li>
                    <li>In Auth0 FGA, <strong>every</strong> relationship tuple in the store is deleted and replaced with the seed tuples from <code>fga/tuples.json</code>. Tuples you added by hand (for example in the exercises) are removed.</li>
                  </ul>
                  <div className="mt-2 text-amber-700 dark:text-amber-300">Demo only: it is unauthenticated and wipes the whole store.</div>
                </div>
              </div>
            </div>
            <OrderTable orders={orders} onView={view} onUpdate={update} onDelete={remove} />
          </section>

          <section className={box}>
            <h2 className="mb-2 font-semibold">Place order</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500 dark:text-slate-400">Target supplier (demo override)
                <input list="suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${input} mt-1 block`} />
                <datalist id="suppliers">{SUPPLIER_IDS.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="text-xs text-slate-500 dark:text-slate-400">Item
                <input value={item} onChange={(e) => setItem(e.target.value)} className={`${input} mt-1 block`} />
              </label>
              <label className="text-xs text-slate-500 dark:text-slate-400">Quantity
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${input} mt-1 block w-24`} />
              </label>
              <button className={primary} onClick={place}>Place order</button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Defaults to {persona.id}&apos;s home supplier ({persona.homeSupplier ?? "none: platform admin"}). Change it to try a cross-tenant order and watch FGA deny it.
            </p>
          </section>

          <section className={box}>
            <h2 className="mb-2 font-semibold">Try any order id <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(including ones you cannot see)</span></h2>
            <div className="flex flex-wrap items-center gap-2">
              <input value={directId} onChange={(e) => setDirectId(e.target.value)} className={`${input} w-24`} aria-label="Order id" />
              <button className={primary} onClick={() => view(directId)}>View</button>
              <button className={primary} onClick={() => update(directId, "confirmed")}>Update status → confirmed</button>
              <button className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700" onClick={() => remove(directId)}>Delete</button>
            </div>
          </section>

        </div>

        <CheckLog groups={groups} onClear={() => setGroups([])} onView={setViewing} />
      {viewing && <HttpModal title={viewing.label} exchange={viewing.http} onClose={() => setViewing(null)} />}
      </main>
    </>
  );
}
