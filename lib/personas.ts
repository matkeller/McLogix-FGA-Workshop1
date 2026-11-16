export type Persona = {
  id: string;
  name: string;
  role: "Sales" | "Manager" | "Admin";
  org: string;
  /** Supplier the persona belongs to. Admin (platform owner) has none. */
  homeSupplier: string | null;
};

export const PERSONAS: Persona[] = [
  { id: "alice", name: "Alice", role: "Sales", org: "Supplier A", homeSupplier: "supplier_a" },
  { id: "armando", name: "Armando", role: "Sales", org: "Supplier A", homeSupplier: "supplier_a" },
  { id: "andy", name: "Andy", role: "Manager", org: "Supplier A", homeSupplier: "supplier_a" },
  { id: "bob", name: "Bob", role: "Sales", org: "Supplier B", homeSupplier: "supplier_b" },
  { id: "marcus", name: "Marcus", role: "Admin", org: "McLogix (platform)", homeSupplier: null },
];

/** Suppliers offered in the UI. Identity of a supplier lives only in FGA tuples. */
export const SUPPLIER_IDS = ["supplier_a", "supplier_b"];
