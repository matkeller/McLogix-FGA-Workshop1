import { actingUser, guarded, respond, unauthenticated, validId } from "@/lib/api";
import { db, STATUSES, type OrderStatus } from "@/lib/db";
import { check, consistencyMode, deleteOrderTuples, errMsg, type Trace } from "@/lib/fga";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// WHAT FGA DOES vs WHAT THIS API LAYER DOES (the key idea of the workshop)
//
//   Auth0 FGA : answers ONE question, "is this user related to this object in a way
//               that grants this permission?", and returns { allowed: true | false }.
//               It stores relationships (tuples) only. It has never heard of
//               "Canned tomatoes", quantities or statuses.
//   This file : the API layer. It identifies the caller, asks FGA, and ONLY IF the
//               answer is yes does it release data from OUR database in the response.
//               The caller never talks to FGA. It just sees 200 + data, 403 or 404.
// ─────────────────────────────────────────────────────────────────────────────

// In Next.js 16 `params` is a Promise.
type Ctx = { params: Promise<{ id: string }> };

// Unknown order -> 404. Existing order the user may not touch -> 403.
// (Production often returns 404 for both, so callers cannot probe which ids exist.)
async function authorize(req: Request, ctx: Ctx, relation: string, trace: Trace) {
  const user = actingUser(req);
  if (!user) return { res: unauthenticated(trace) };
  const { id } = await ctx.params;
  // Our database answers "does this order exist?" (FGA cannot: it only stores relationships).
  const order = validId(id) ? db.get(id) : undefined;
  if (!order) return { res: respond(404, null, trace, `Order ${id} not found.`) };
  // Ask FGA the yes/no question. Its answer carries no order details.
  if (!(await check(trace, `user:${user}`, relation, `order:${id}`))) {
    // FGA said no: the API layer turns that into a 403. The order row is NOT included.
    return { res: respond(403, null, trace, `${user} is not allowed to ${relation.replace("can_", "")} order ${id}.`) };
  }
  return { user, order };
}

export async function GET(req: Request, ctx: Ctx) {
  const trace: Trace = [];
  return guarded(trace, async () => {
    const a = await authorize(req, ctx, "can_view", trace);
    if (a.res) return a.res; // 401 / 404 / 403: FGA's "no" becomes an error response
    // FGA said yes. The order details in this 200 (item, quantity, status) come from OUR database, never from FGA.
    return respond(200, a.order, trace);
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const trace: Trace = [];
  return guarded(trace, async () => {
    const a = await authorize(req, ctx, "can_update", trace);
    if (a.res) return a.res;
    // FGA only said "allowed". The change itself (status, quantity...) is applied to OUR database.
    const body = await req.json().catch(() => null);
    const patch: { status?: OrderStatus; item?: string; quantity?: number } = {};
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) return respond(400, null, trace, `status must be one of ${STATUSES.join(", ")}.`);
      patch.status = body.status;
    }
    if (typeof body?.item === "string" && body.item.trim()) patch.item = body.item.trim();
    if (body?.quantity !== undefined) {
      if (!Number.isInteger(body.quantity) || body.quantity < 1) return respond(400, null, trace, "quantity must be a positive integer.");
      patch.quantity = body.quantity;
    }
    if (!Object.keys(patch).length) return respond(400, null, trace, "Provide status, item or quantity.");
    return respond(200, db.update(a.order!.id, patch), trace);
  });
}

// DELETE: DB first, then FGA, with compensation (restore the row) if the FGA delete fails.
export async function DELETE(req: Request, ctx: Ctx) {
  const trace: Trace = [];
  return guarded(trace, async () => {
    const a = await authorize(req, ctx, "can_delete", trace);
    if (a.res) return a.res;
    const order = a.order!;
    db.remove(order.id);
    try {
      await deleteOrderTuples(trace, order.id);
    } catch (err) {
      db.restore(order);
      trace.push({
        call: "compensate", user: `user:${a.user}`, relation: "-", object: `order:${order.id}`,
        allowed: null, consistency: consistencyMode(), ms: 0, note: "FGA delete failed, DB row restored (rolled back)",
      });
      return respond(502, null, trace, `FGA delete failed; delete rolled back. (${errMsg(err)})`);
    }
    return respond(200, { id: order.id, deleted: true }, trace);
  });
}
