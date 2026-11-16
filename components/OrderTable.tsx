import { STATUSES, type Order } from "@/lib/db";

type Props = {
  orders: Order[];
  onView: (id: string) => void;
  onUpdate: (id: string, status: string) => void;
  onDelete: (id: string) => void;
};

const btn =
  "rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";
const neutral = `${btn} dark:text-slate-200`;

export function OrderTable({ orders, onView, onUpdate, onDelete }: Props) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
        <tr><th className="py-1">Order</th><th>Supplier</th><th>Item</th><th>Qty</th><th>Placed by</th><th>Status</th><th /></tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1 font-mono">{o.id}</td>
            <td>{o.supplierId}</td>
            <td>{o.item}</td>
            <td>{o.quantity}</td>
            <td>{o.placedBy}</td>
            <td>{o.status}</td>
            <td className="space-x-1 whitespace-nowrap py-1 text-right">
              <button className={neutral} onClick={() => onView(o.id)}>View</button>
              <select
                aria-label={`Update status of ${o.id}`}
                className={neutral}
                value=""
                onChange={(e) => e.target.value && onUpdate(o.id, e.target.value)}
              >
                <option value="">Update status…</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <button className={`${btn} text-red-700 dark:text-red-400`} onClick={() => onDelete(o.id)}>Delete</button>
            </td>
          </tr>
        ))}
        {orders.length === 0 && (
          <tr><td colSpan={7} className="py-3 text-slate-400">No orders visible to this user.</td></tr>
        )}
      </tbody>
    </table>
  );
}
