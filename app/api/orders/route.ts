import { actingUser, guarded, respond, unauthenticated, validId } from "@/lib/api";
import { db } from "@/lib/db";
import { check, consistencyMode, listObjects, writeOrderTuples, errMsg, type Trace } from "@/lib/fga";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// WHAT FGA DOES vs WHAT THIS API LAYER DOES (the key idea of the workshop)
//
//   Auth0 FGA : answers ONE question, "is this user related to this object in a way
//               that grants this permission?", and returns { allowed: true | false }.
//               It stores relationships (tuples) only. It has never heard of
//               "Canned tomatoes", quantities or statuses.
//   These routes: the API layer. It identifies the caller, asks FGA, and ONLY IF the
//               answer is yes does it release data from OUR database in the response.
//               The caller never talks to FGA. It just sees 200 + data, 403 or 404.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/orders: list-filtering pattern. Ask FGA which orders the user can view, then hydrate from the DB.
export async function GET(req: Request) {
  const trace: Trace = [];
  const user = actingUser(req);
  if (!user) return unauthenticated(trace);
  return guarded(trace, async () => {
    // FGA returns ONLY ids, e.g. ["order:1001"]. It has no item names or quantities to return.
    const ids = await listObjects(trace, `user:${user}`, "can_view", "order");
    // The order details are looked up in OUR database. IDs that exist in FGA but not in the DB are ignored.
    const orders = ids.map((o) => db.get(o.replace(/^order:/, ""))).filter((o) => o !== undefined);
    return respond(200, orders, trace);
  });
}

// POST /api/orders { supplierId, item, quantity }: check can_place_order, then dual-write (DB first, then FGA).
export async function POST(req: Request) {
  const trace: Trace = [];
  const user = actingUser(req);
  if (!user) return unauthenticated(trace);
  const body = await req.json().catch(() => null);
  const { supplierId, item, quantity } = body ?? {};
  if (!validId(supplierId) || typeof item !== "string" || !item.trim() || !Number.isInteger(quantity) || quantity < 1) {
    return respond(400, null, trace, "Body must be { supplierId: string, item: string, quantity: positive integer }.");
  }
  return guarded(trace, async () => {
    if (!(await check(trace, `user:${user}`, "can_place_order", `supplier:${supplierId}`))) {
      return respond(403, null, trace, `${user} cannot place orders for ${supplierId}.`);
    }
    // FGA said this user may place orders for the supplier. Now OUR database stores the real order data.
    // 1. DB first.
    const order = db.insert({ supplierId, item: item.trim(), quantity, placedBy: user });
    try {
      // 2. Then FGA, which is told only ids and relationships (never the item or quantity).
      await writeOrderTuples(trace, order.id, supplierId, user);
    } catch (err) {
      // 3. Compensate: remove the row so no order exists without tuples.
      db.remove(order.id);
      trace.push({
        call: "compensate", user: `user:${user}`, relation: "-", object: `order:${order.id}`,
        allowed: null, consistency: consistencyMode(), ms: 0, note: "FGA write failed, DB row deleted (rolled back)",
      });
      return respond(502, null, trace, `FGA write failed; order rolled back. (${errMsg(err)})`);
    }
    return respond(201, order, trace);
  });
}
