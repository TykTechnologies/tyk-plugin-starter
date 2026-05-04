#!/usr/bin/env bash
# post-key-auth-tenant-context plugin e2e: create a key with tenant metadata
# via the gateway's REST API, then call the gated endpoint and verify the
# upstream sees the X-Tenant-Id header injected by the plugin.
set -euo pipefail

GW="${GATEWAY_URL:-http://localhost:18080}"
TYK_SECRET="e2e-test-secret"
TENANT_ID="acme-corp"

# Create a key bound to the tenant API with tenant_id in meta_data.
KEY_PAYLOAD='{
  "rate": 0,
  "per": 0,
  "quota_max": -1,
  "quota_renewal_rate": 0,
  "expires": 0,
  "access_rights": {
    "tenant-e2e": {
      "api_id": "tenant-e2e",
      "api_name": "tenant-e2e",
      "versions": ["Default"]
    }
  },
  "meta_data": {"tenant_id": "'"$TENANT_ID"'"}
}'

KEY_RESP=$(curl -sS -X POST "$GW/tyk/keys/create" \
  -H "X-Tyk-Authorization: $TYK_SECRET" \
  -H "Content-Type: application/json" \
  -d "$KEY_PAYLOAD")

KEY=$(printf '%s' "$KEY_RESP" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("key", ""))
except Exception:
    print("")
')
if [ -z "$KEY" ]; then
  echo "FAIL: could not create key"
  echo "Response: $KEY_RESP"
  exit 1
fi

# Use the key — upstream should observe X-Tenant-Id
RESP=$(curl -sS "$GW/tenant/anything" -H "Authorization: $KEY")
TENANT_OUT=$(printf '%s' "$RESP" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    hdrs = d.get("headers", {})
    print(hdrs.get("X-Tenant-Id") or hdrs.get("x-tenant-id") or "")
except Exception:
    print("")
')

if [ "$TENANT_OUT" != "$TENANT_ID" ]; then
  echo "FAIL: upstream did not observe X-Tenant-Id='$TENANT_ID' (got '$TENANT_OUT')"
  echo "Response: $RESP"
  exit 1
fi

echo "PASS: tenant — key created, upstream saw X-Tenant-Id='$TENANT_OUT'"
