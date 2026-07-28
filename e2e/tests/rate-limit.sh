#!/usr/bin/env bash
# rate-limiter plugin e2e: LIMIT=5 requests per window per caller (X-Client-Id).
# Assert the first 5 pass (200), the 6th is rejected with 429 + Retry-After, and
# that a different caller has an independent bucket. The plugin increments a
# per-(caller, window) counter via TykStorageIncr against the gateway's Redis.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
LIMIT=5
# Unique caller id so repeated local runs don't collide (CI tears Redis down anyway).
CID="e2e-$(date +%s)-$$"

# First LIMIT requests: allowed (200).
for i in $(seq 1 "$LIMIT"); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$GW/ratelimit/get" -H "X-Client-Id: $CID")
  if [ "$code" != "200" ]; then
    echo "FAIL: request $i/$LIMIT expected 200, got $code"
    exit 1
  fi
done

# The next request tips the caller over the limit → 429 with Retry-After.
resp=$(curl -sS -D - -o /dev/null "$GW/ratelimit/get" -H "X-Client-Id: $CID")
code=$(printf '%s' "$resp" | awk 'NR==1{print $2}')
if [ "$code" != "429" ]; then
  echo "FAIL: request $((LIMIT + 1)) expected 429, got $code"
  exit 1
fi
if ! printf '%s' "$resp" | grep -qi '^Retry-After:'; then
  echo "FAIL: 429 response missing Retry-After header"
  printf '%s\n' "$resp" | sed 's/^/    /'
  exit 1
fi

# A different caller is unaffected (independent per-caller bucket).
code_other=$(curl -sS -o /dev/null -w '%{http_code}' "$GW/ratelimit/get" -H "X-Client-Id: other-$CID")
if [ "$code_other" != "200" ]; then
  echo "FAIL: a different caller expected 200, got $code_other"
  exit 1
fi

echo "PASS: rate-limiter — 5 allowed, 6th 429 w/ Retry-After, other caller unaffected"
