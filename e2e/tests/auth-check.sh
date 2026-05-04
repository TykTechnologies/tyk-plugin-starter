#!/usr/bin/env bash
# auth-check-hmac plugin e2e: assert that requests with a valid X-Signature
# (HMAC-SHA256 hex of method+URL+body keyed by hmac_secret) are accepted, and
# that missing or wrong signatures get rejected with 401.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
SECRET="e2e-hmac-secret-1234"
METHOD="POST"
PATH_="/auth/anything"
URL_="$PATH_"
BODY='{"x":1}'

# Compute expected signature: HMAC-SHA256(method + url + body, secret) hex.
# The auth_check hook runs before path-stripping, so request.URL is the listen-path form.
SIG=$(printf '%s' "$METHOD$PATH_$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

# Case 1: missing signature → 401
CODE_NOSIG=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$GW$PATH_" -d "$BODY")
if [ "$CODE_NOSIG" != "401" ]; then
  echo "FAIL: expected 401 with no signature, got $CODE_NOSIG"
  exit 1
fi

# Case 2: wrong signature → 401
CODE_BADSIG=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$GW$PATH_" \
  -H "X-Signature: deadbeef" \
  -d "$BODY")
if [ "$CODE_BADSIG" != "401" ]; then
  echo "FAIL: expected 401 with wrong signature, got $CODE_BADSIG"
  exit 1
fi

# Case 3: valid signature → 200
CODE_OK=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$GW$PATH_" \
  -H "X-Signature: $SIG" \
  -d "$BODY")
if [ "$CODE_OK" != "200" ]; then
  echo "FAIL: expected 200 with valid signature, got $CODE_OK"
  echo "  signing input: $METHOD$PATH_$BODY"
  echo "  signature:     $SIG"
  exit 1
fi

echo "PASS: auth-check — 401 on no/bad sig, 200 on valid sig"
