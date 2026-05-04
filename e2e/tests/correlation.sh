#!/usr/bin/env bash
# post-correlation-id plugin e2e: assert X-Correlation-Id is preserved if
# inbound, otherwise generated as a UUID v4 and visible to upstream.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"

# Case 1: inbound header is preserved
CORR_IN="my-trace-abc-123"
RESP=$(curl -sS "$GW/correlation/anything" -H "X-Correlation-Id: $CORR_IN")
CORR_OUT=$(printf '%s' "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
hdrs = d.get("headers", {})
print(hdrs.get("X-Correlation-Id") or hdrs.get("x-correlation-id") or "")
')
if [ "$CORR_OUT" != "$CORR_IN" ]; then
  echo "FAIL: inbound X-Correlation-Id not preserved (got '$CORR_OUT', wanted '$CORR_IN')"
  exit 1
fi

# Case 2: no inbound header → upstream sees a freshly-generated UUID v4
RESP2=$(curl -sS "$GW/correlation/anything")
CORR_GEN=$(printf '%s' "$RESP2" | python3 -c '
import json, sys
d = json.load(sys.stdin)
hdrs = d.get("headers", {})
print(hdrs.get("X-Correlation-Id") or hdrs.get("x-correlation-id") or "")
')
if [ -z "$CORR_GEN" ]; then
  echo "FAIL: no X-Correlation-Id seen upstream when none was sent"
  exit 1
fi
if ! printf '%s' "$CORR_GEN" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'; then
  echo "FAIL: generated correlation id '$CORR_GEN' is not a UUID v4"
  exit 1
fi

echo "PASS: correlation — preserved '$CORR_IN', generated UUID '$CORR_GEN'"
