const cell = "rounded border border-slate-200 p-3 dark:border-slate-700";

/** Always-visible (collapsible) reminder of the workshop's key idea. */
export function HowToRead() {
  return (
    <details className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/40 lg:col-span-2">
      <summary className="cursor-pointer font-semibold text-indigo-900 dark:text-indigo-200">
        How to read this demo: FGA decides, the API serves the data
      </summary>
      <p className="mt-2 text-slate-700 dark:text-slate-300">
        The responses you see here are <strong>not</strong> FGA responses. FGA has never heard of &quot;Canned tomatoes&quot; or a quantity of 40. It only
        stores relationships and answers <em>&quot;is this user allowed?&quot;</em>. The <strong>API layer</strong> asks FGA, and only if the answer is yes does it
        return the order from <strong>our own database</strong>. Click <strong>View</strong> on any log entry to see the real REST call.
      </p>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <div className={`${cell} bg-white dark:bg-slate-900`}>
          <div className="font-semibold">Auth0 FGA</div>
          <div className="text-slate-600 dark:text-slate-400">Knows relationships only (<code>user:alice placed_by order:1001</code>). Returns <code>allowed: true/false</code> or a list of ids. Never sees items or quantities.</div>
        </div>
        <div className={`${cell} bg-white dark:bg-slate-900`}>
          <div className="font-semibold">API layer (this app&apos;s <code>/api</code> routes)</div>
          <div className="text-slate-600 dark:text-slate-400">Identifies the caller, asks FGA, then returns <code>200</code> + data, <code>403</code> or <code>404</code>. The caller never talks to FGA.</div>
        </div>
        <div className={`${cell} bg-white dark:bg-slate-900`}>
          <div className="font-semibold">Database</div>
          <div className="text-slate-600 dark:text-slate-400">Holds the business data: item, quantity, status. Rows are only released when FGA says yes.</div>
        </div>
      </div>
    </details>
  );
}
