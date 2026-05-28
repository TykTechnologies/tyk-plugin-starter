#!/usr/bin/env bash
# PII plugin e2e: assert that SSN-shaped patterns in the response body are
# masked before reaching the client. httpbin.org/anything echoes query params
# back in the response body, so we use that as a controlled SSN source.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"

# Send two fake SSNs via query string. Upstream echoes them back in the body.
RESP=$(curl -sS "$GW/pii/anything?ssn=123-45-6789&also=987-65-4321")

# The original SSNs must NOT appear in the response (gateway redacted them)
if printf '%s' "$RESP" | grep -q '123-45-6789'; then
  echo "FAIL: original SSN 123-45-6789 leaked through (plugin did not redact)"
  echo "Response: $RESP"
  exit 1
fi
if printf '%s' "$RESP" | grep -q '987-65-4321'; then
  echo "FAIL: original SSN 987-65-4321 leaked through (plugin did not redact)"
  echo "Response: $RESP"
  exit 1
fi

# The mask must appear at least twice (one per redacted SSN)
MASK_COUNT=$(printf '%s' "$RESP" | grep -o '\*\*\*-\*\*-\*\*\*\*' | wc -l | tr -d ' ')
if [ "$MASK_COUNT" -lt 2 ]; then
  echo "FAIL: expected ≥2 redaction masks in response, got $MASK_COUNT"
  echo "Response: $RESP"
  exit 1
fi

# No-SSN body should pass through verbatim
RESP2=$(curl -sS "$GW/pii/anything?normal=hello")
if ! printf '%s' "$RESP2" | grep -q '"normal": "hello"'; then
  echo "FAIL: clean body did not pass through correctly"
  echo "Response: $RESP2"
  exit 1
fi

echo "PASS: pii — both SSNs masked, $MASK_COUNT mask occurrences, clean body untouched"
