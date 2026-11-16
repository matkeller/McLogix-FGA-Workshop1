import type { FgaTrace } from "@/lib/fga";
import type { HttpExchange } from "./HttpModal";

export type LogGroup = { id: number; label: string; status: number; fga: FgaTrace[]; http: HttpExchange };

const statusColor = (s: number) => (s < 300 ? "text-green-700 dark:text-green-400" : s < 500 ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400");

export function CheckLog({ groups, onClear, onView }: { groups: LogGroup[]; onClear: () => void; onView: (g: LogGroup) => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <h2 className="font-semibold">Live FGA check log</h2>
        <button onClick={onClear} className="text-xs text-slate-500 hover:underline dark:text-slate-400">clear</button>
      </header>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3 font-mono text-xs">
        {groups.length === 0 && <p className="text-slate-400">Do something. Every FGA call shows up here.</p>}
        {groups.map((g) => (
          <div key={g.id} className="rounded border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between bg-slate-100 px-2 py-1 dark:bg-slate-800">
              <span>{g.label}</span>
              <span className="flex items-center gap-2">
                <span className={`font-bold ${statusColor(g.status)}`}>HTTP {g.status}</span>
                <button
                  onClick={() => onView(g)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  View
                </button>
              </span>
            </div>
            {g.fga.length === 0 && (
              <div className="px-2 py-1 text-slate-400">
                {g.status >= 500 ? "FGA call failed before a decision was returned" : "no FGA call (rejected before authorization)"}
              </div>
            )}
            {g.fga.map((t, i) => (
              <div
                key={i}
                className={`border-t border-slate-100 px-2 py-1 dark:border-slate-800 ${
                  t.call === "compensate" ? "bg-amber-50 dark:bg-amber-950/40" : t.allowed === true ? "bg-green-50 dark:bg-green-950/40" : t.allowed === false ? "bg-red-50 dark:bg-red-950/40" : ""
                }`}
              >
                <div>
                  <b>{t.call}</b>({t.user}, {t.relation}, {t.object})
                  {t.allowed !== null && (
                    <span className={`ml-2 font-bold ${t.allowed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      allowed: {String(t.allowed)}
                    </span>
                  )}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {t.consistency} · {t.ms} ms{t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
