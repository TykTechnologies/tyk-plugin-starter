#!/usr/bin/env bash
# Multi-bundle composition: assert that two pre-hook bundles listed as a
# comma-separated value in custom_middleware_bundle both run on the same API.
#
# Bundle A (pre-trace-id)        adds X-Trace-Id.
# Bundle B (jws-request-signing) adds X-Signature.
# Both ship a global named `handler` — the gateway's per-(file, name) IIFE
# wrap aliases each export so they coexist without colliding.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
BODY='{"order":"multi-bundle-demo"}'

RESP=$(curl -sS -X POST "$GW/multi/anything" \
  -H 'Content-Type: application/json' \
  --data "$BODY")

# Both headers must reach the upstream — proves both pre-hook plugins fired.
TRACE=$(printf '%s' "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
h = d.get("headers", {})
print(h.get("X-Trace-Id") or h.get("x-trace-id") or "")
')

SIG=$(printf '%s' "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
h = d.get("headers", {})
print(h.get("X-Signature") or h.get("x-signature") or "")
')

if [ -z "$TRACE" ]; then
  echo "FAIL: bundle pre-trace-id did not run — no X-Trace-Id on upstream request"
  echo "Response: $RESP"
  exit 1
fi
if [ -z "$SIG" ]; then
  echo "FAIL: bundle jws-request-signing did not run — no X-Signature on upstream request"
  echo "Response: $RESP"
  exit 1
fi

PARTS=$(printf '%s' "$SIG" | awk -F. '{print NF}')
if [ "$PARTS" != "3" ]; then
  echo "FAIL: jws-request-signing X-Signature malformed (expected 3-part JWS, got $PARTS): $SIG"
  exit 1
fi

echo "PASS: multi-bundle — pre-trace-id trace=${TRACE} + jws-request-signing signature 3-part JWS"
