// Verifies that the `file:LINE` references in README.md still point at the code they describe.
// Run: npm run check:refs. If it fails, update the line numbers in README.md (it tells you the right ones).
import { readFileSync } from "node:fs";

const ID = "app/api/orders/[id]/route.ts";
const LIST = "app/api/orders/route.ts";

// [file, text that identifies the line, what it is]
const REFS: [string, string, string][] = [
  [ID, "if (!order) return { res: respond(404", "404 comes from our database; FGA is not asked"],
  [ID, "if (!(await check(trace", "the FGA check (returns only allowed: true/false)"],
  [ID, "return { res: respond(403", "FGA said no, so the API layer returns 403 with no order data"],
  [ID, "return respond(200, a.order, trace)", "FGA said yes; the 200 and order details come from our database"],
  [LIST, "await listObjects(trace", "FGA returns only ids"],
  [LIST, "const orders = ids.map", "order details are looked up in our database"],
  [LIST, "const order = db.insert", "item and quantity are stored in our database"],
  [LIST, "await writeOrderTuples(", "FGA is told only ids and relationships"],
];

const readme = readFileSync("README.md", "utf8");
let bad = 0;
for (const [file, needle, what] of REFS) {
  const lines = readFileSync(file, "utf8").split("\n");
  const actual = lines.findIndex((l) => l.includes(needle)) + 1;
  if (!actual) { console.error(`MISSING  ${file}: no line contains "${needle}"`); bad++; continue; }
  if (readme.includes(`\`${file}:${actual}\``)) console.log(`ok       ${file}:${actual}  ${what}`);
  else { console.error(`DRIFTED  README.md must reference \`${file}:${actual}\` (${what})`); bad++; }
}
process.exit(bad ? 1 : 0);
