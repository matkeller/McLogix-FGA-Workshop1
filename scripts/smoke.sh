#!/usr/bin/env bash
# Allow/deny smoke test for the running app (npm run dev). Resets data first.
# Usage: npm run smoke   (or BASE_URL=http://localhost:3000 bash scripts/smoke.sh)
set -u
BASE="${BASE_URL:-http://localhost:3000}"
pass=0; fail=0

# req USER METHOD PATH [JSON_BODY] [extra curl args...] -> sets STATUS and BODY
req() {
  local user="$1" method="$2" path="$3" body="${4:-}"; shift 4 2>/dev/null || shift $#
  local args=(-s -X "$method" "$BASE$path" -w $'\n%{http_code}')
  [ -n "$user" ] && args+=(-H "x-user-id: $user")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}" "$@")
  STATUS="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}

expect() { # expect "label" actual expected
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL  %s (got %s, want %s)\n' "$1" "$2" "$3"; fi
}

echo "== Reset & Sync"
req "" POST /api/seed ""; expect "POST /api/seed" "$STATUS" 200

echo "== Authentication (demo header)"
req "" GET /api/orders ""; expect "no x-user-id -> 401" "$STATUS" 401

echo "== List filtering (listObjects)"
for pair in alice:1 armando:1 andy:3 bob:1 marcus:4; do
  u="${pair%%:*}"; n="${pair##*:}"
  req "$u" GET /api/orders ""
  expect "$u sees $n order(s)" "$(echo "$BODY" | jq '.data | length')" "$n"
done

echo "== GET /api/orders/{id}  (check can_view)"
view_expect() { # expected status for 1001 1002 1003 1004 (portable: no associative arrays)
  case "$1" in
    alice)   echo "200 403 403 403" ;;
    armando) echo "403 200 403 403" ;;
    andy)    echo "200 200 200 403" ;;
    bob)     echo "403 403 403 200" ;;
    marcus)  echo "200 200 200 200" ;;
  esac
}
for u in alice armando andy bob marcus; do
  i=0; for want in $(view_expect "$u"); do
    id=$((1001+i)); i=$((i+1))
    req "$u" GET "/api/orders/$id" ""; expect "$u GET $id" "$STATUS" "$want"
  done
done
req alice GET /api/orders/9999 ""; expect "unknown order -> 404" "$STATUS" 404

echo "== PATCH (check can_update)"
req alice PATCH /api/orders/1002 '{"status":"confirmed"}'; expect "alice PATCH 1002 (not hers)" "$STATUS" 403
req alice PATCH /api/orders/1001 '{"status":"confirmed"}'; expect "alice PATCH 1001 (hers)" "$STATUS" 200
req andy  PATCH /api/orders/1002 '{"status":"shipped"}';   expect "andy PATCH 1002 (manager)" "$STATUS" 200
req andy  PATCH /api/orders/1004 '{"status":"shipped"}';   expect "andy PATCH 1004 (other supplier)" "$STATUS" 403
req marcus PATCH /api/orders/1004 '{"status":"shipped"}';  expect "marcus PATCH 1004 (admin)" "$STATUS" 200

echo "== POST (check can_place_order)"
mk() { echo "{\"supplierId\":\"$1\",\"item\":\"Smoke test\",\"quantity\":5}"; }
req alice  POST /api/orders "$(mk supplier_a)"; expect "alice -> supplier_a" "$STATUS" 201; A_ID=$(echo "$BODY" | jq -r .data.id)
req alice  POST /api/orders "$(mk supplier_b)"; expect "alice -> supplier_b (cross-tenant)" "$STATUS" 403
req bob    POST /api/orders "$(mk supplier_a)"; expect "bob -> supplier_a (cross-tenant)" "$STATUS" 403
req bob    POST /api/orders "$(mk supplier_b)"; expect "bob -> supplier_b" "$STATUS" 201
req andy   POST /api/orders "$(mk supplier_a)"; expect "andy -> supplier_a" "$STATUS" 201
req marcus POST /api/orders "$(mk supplier_a)"; expect "marcus -> supplier_a (admin cannot place)" "$STATUS" 403
req marcus POST /api/orders "$(mk supplier_b)"; expect "marcus -> supplier_b (admin cannot place)" "$STATUS" 403
req alice  POST /api/orders '{"supplierId":"supplier_a"}'; expect "invalid body -> 400" "$STATUS" 400
req alice  GET "/api/orders/$A_ID" ""; expect "new order visible to its creator" "$STATUS" 200
req armando GET "/api/orders/$A_ID" ""; expect "new order hidden from other sales rep" "$STATUS" 403
req andy   GET "/api/orders/$A_ID" ""; expect "new order visible to manager" "$STATUS" 200

echo "== DELETE (check can_delete)"
req bob    DELETE "/api/orders/$A_ID" ""; expect "bob DELETE supplier_a order" "$STATUS" 403
req armando DELETE "/api/orders/$A_ID" ""; expect "armando DELETE alice's order" "$STATUS" 403
req alice  DELETE "/api/orders/$A_ID" ""; expect "alice DELETE own order" "$STATUS" 200
req alice  GET "/api/orders/$A_ID" ""; expect "deleted order -> 404" "$STATUS" 404
req marcus DELETE /api/orders/1004 ""; expect "marcus DELETE 1004 (admin)" "$STATUS" 200
req andy   DELETE /api/orders/1002 ""; expect "andy DELETE 1002 (manager)" "$STATUS" 200

echo "== Every JSON response carries { data, fga }"
req alice GET /api/orders ""
expect "response has data and fga keys" "$(echo "$BODY" | jq 'has("data") and has("fga")')" true
expect "fga entry has required fields" "$(echo "$BODY" | jq '.fga[0] | has("call") and has("user") and has("relation") and has("object") and has("allowed") and has("consistency") and has("ms")')" true

req "" POST /api/seed ""  # leave the demo in a clean state
echo; echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
