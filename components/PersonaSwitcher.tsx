import { PERSONAS, type Persona } from "@/lib/personas";

export function PersonaSwitcher({ persona, onChange }: { persona: Persona; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="persona" className="text-sm text-slate-500 dark:text-slate-400">Acting as</label>
      <select
        id="persona"
        value={persona.id}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>{p.id}</option>
        ))}
      </select>
      <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">{persona.role}</span>
      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{persona.org}</span>
    </div>
  );
}
