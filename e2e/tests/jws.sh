#!/usr/bin/env bash
# JWS plugin e2e: assert that an X-Signature header is added by the gateway
# and that the body's HMAC matches the configured secret.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
SECRET="e2e-shared-secret-1234"
BODY='{"order":"abc-123"}'

# httpbin.org/anything echoes back the headers it received from us (via the
# gateway), so we can read X-Signature out of the upstream-observed headers.
RESP=$(curl -sS -X POST "$GW/jws/anything" \
  -H 'Content-Type: application/json' \
  --data "$BODY")

SIG=$(printf '%s' "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
hdrs = d.get("headers", {})
sig = hdrs.get("X-Signature") or hdrs.get("x-signature")
print(sig or "")
')

if [ -z "$SIG" ]; then
  echo "FAIL: gateway did not add X-Signature (upstream saw no signature)"
  echo "Response: $RESP"
  exit 1
fi

# Verify signature shape: header.payload.signature (base64url segments).
# awk -F. '{print NF}' counts fields, robust to trailing-newline weirdness in wc -l.
PARTS=$(printf '%s' "$SIG" | awk -F. '{print NF}')
if [ "$PARTS" != "3" ]; then
  echo "FAIL: X-Signature is not in JWS compact form (expected 3 parts, got $PARTS): $SIG"
  exit 1
fi

# Verify the HMAC matches what we'd compute independently
EXPECTED=$(printf '%s' "$BODY" | python3 -c '
import sys, hmac, hashlib, base64
body = sys.stdin.read()
secret = "'"$SECRET"'".encode()
header_b64 = base64.urlsafe_b64encode(b"{\"alg\":\"HS256\",\"typ\":\"JWS\"}").rstrip(b"=").decode()
payload_b64 = base64.urlsafe_b64encode(body.encode()).rstrip(b"=").decode()
signing_input = (header_b64 + "." + payload_b64).encode()
sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
print(header_b64 + "." + payload_b64 + "." + sig_b64)
')

if [ "$SIG" != "$EXPECTED" ]; then
  echo "FAIL: X-Signature does not match independent HMAC computation."
  echo "Got:      $SIG"
  echo "Expected: $EXPECTED"
  exit 1
fi

echo "PASS: jws — signature present, three-part JWS compact form, HMAC matches"
