#!/usr/bin/env bash
# idempotency-guard plugin e2e: the FIRST request with a given Idempotency-Key
# claims it (via atomic TykStorageSetNX) and passes (200); a repeat with the
# same key is rejected as a duplicate (409); a different key is a fresh claim
# (200); and a request with no key opts out and passes through (200).
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
# Unique key so repeated local runs don't collide (CI tears Redis down anyway).
KEY="e2e-idem-$(date +%s)-$$"

post() { # $1 = optional Idempotency-Key
  if [ -n "${1:-}" ]; then
    curl -sS -o /dev/null -w '%{http_code}' -X POST "$GW/idem/anything" -H "Idempotency-Key: $1" -d '{"x":1}'
  else
    curl -sS -o /dev/null -w '%{http_code}' -X POST "$GW/idem/anything" -d '{"x":1}'
  fi
}

# First use of the key → claimed → 200.
code1=$(post "$KEY")
if [ "$code1" != "200" ]; then
  echo "FAIL: first request with key expected 200, got $code1"
  exit 1
fi

# Repeat with the same key → duplicate → 409.
code2=$(post "$KEY")
if [ "$code2" != "409" ]; then
  echo "FAIL: duplicate request expected 409, got $code2"
  exit 1
fi

# A different key → fresh claim → 200.
code3=$(post "${KEY}-other")
if [ "$code3" != "200" ]; then
  echo "FAIL: different key expected 200, got $code3"
  exit 1
fi

# No key → opts out of idempotency → passes through (200).
code4=$(post "")
if [ "$code4" != "200" ]; then
  echo "FAIL: no key expected 200 (pass-through), got $code4"
  exit 1
fi

echo "PASS: idempotency-guard — 200 first, 409 duplicate, 200 new key, 200 no-key"
