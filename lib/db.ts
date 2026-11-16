// In-memory "database". Stored on globalThis so it survives Next.js dev hot reloads.
// Resets on server restart (FGA does not, which is why Reset & Sync exists).

export type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled";
export const STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "cancelled"];

export type Order = {
  id: string;
  supplierId: string;
  item: string;
  quantity: number;
  status: OrderStatus;
  placedBy: string;
  createdAt: string;
};

function seedOrders(): Order[] {
  const now = new Date().toISOString();
  const o = (id: string, supplierId: string, placedBy: string, item: string, quantity: number): Order => ({
    id, supplierId, placedBy, item, quantity, status: "pending", createdAt: now,
  });
  return [
    o("1001", "supplier_a", "alice", "Canned tomatoes", 40),
    o("1002", "supplier_a", "armando", "Paper towels", 120),
    o("1003", "supplier_a", "andy", "Bottled water", 300),
    o("1004", "supplier_b", "bob", "Snack bars", 75),
  ];
}

type Store = { orders: Map<string, Order>; nextId: number };

const g = globalThis as unknown as { __mclogixDb?: Store };

function fresh(): Store {
  return { orders: new Map(seedOrders().map((o) => [o.id, o])), nextId: 1005 };
}

function store(): Store {
  return (g.__mclogixDb ??= fresh());
}

export const db = {
  list: (): Order[] => [...store().orders.values()],
  get: (id: string): Order | undefined => store().orders.get(id),
  insert(input: Omit<Order, "id" | "createdAt" | "status">): Order {
    const s = store();
    const order: Order = {
      ...input, id: String(s.nextId++), status: "pending", createdAt: new Date().toISOString(),
    };
    s.orders.set(order.id, order);
    return order;
  },
  update(id: string, patch: Partial<Pick<Order, "status" | "item" | "quantity">>): Order | undefined {
    const cur = store().orders.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    store().orders.set(id, next);
    return next;
  },
  remove: (id: string): boolean => store().orders.delete(id),
  /** Used by compensation to put back a row that was deleted. */
  restore: (order: Order): void => void store().orders.set(order.id, order),
  reset: (): void => void (g.__mclogixDb = fresh()),
};
