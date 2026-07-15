#!/usr/bin/env bash
# E2E test runner. Stages bundles, brings up the OSS gateway with sidecars,
# runs each tests/*.sh against it, tears down. Used both locally and in CI.
set -euo pipefail

cd "$(dirname "$0")"

# Ensure the goja-enabled gateway image exists. (See gateway.Dockerfile for why
# we don't use the published image directly.)
TYK_IMAGE="${TYK_IMAGE:-tyk-gateway:goja-dev}"
if ! docker image inspect "$TYK_IMAGE" >/dev/null 2>&1; then
  echo "=== Gateway image $TYK_IMAGE not found — building ==="
  bash ./build-gateway-image.sh
fi
export TYK_IMAGE

echo "=== Staging bundles (recompute checksum) ==="
node ./stage-bundles.mjs

echo
echo "=== Booting docker-compose stack ==="
docker compose up -d

GW_URL="http://localhost:18080"

echo
echo -n "=== Waiting for gateway readiness on $GW_URL "
for i in $(seq 1 60); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$GW_URL/hello" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo " ready (after ${i}s)"
    break
  fi
  echo -n "."
  sleep 1
done
if [ "$code" != "200" ]; then
  echo
  echo "gateway not ready after 60s — last code: $code"
  docker compose logs gateway 2>&1 | tail -30
  docker compose down -v >/dev/null 2>&1 || true
  exit 1
fi

# Bundles load asynchronously after gateway start — /hello turns 200 before
# the APIs are served (they 503 until their bundle is fetched), and an API can
# briefly serve without its middleware attached. Poll both stages instead of
# sleeping a fixed amount: first until every API stops returning 503, then
# until a canary confirms bundle middleware actually runs.
echo
echo -n "=== Waiting for APIs to load "
apis_ready=""
for i in $(seq 1 60); do
  pending=0
  for app in apps/*.json; do
    lp=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['proxy']['listen_path'])" "$app")
    code=$(curl -sS -o /dev/null -w '%{http_code}' "$GW_URL${lp}get" 2>/dev/null || echo "000")
    case "$code" in 503|000) pending=1 ;; esac
  done
  if [ "$pending" = "0" ]; then
    apis_ready="yes"
    echo " ready (after ${i}s)"
    break
  fi
  echo -n "."
  sleep 1
done
if [ -z "$apis_ready" ]; then
  echo
  echo "APIs still returning 503 after 60s"
  docker compose logs gateway 2>&1 | tail -30
  docker compose down -v >/dev/null 2>&1 || true
  exit 1
fi

# Canary: the multi-bundle API must inject X-Trace-Id — proves bundle
# middleware is executing, not just that the API is routable.
echo -n "=== Waiting for bundle middleware "
mw_ready=""
for i in $(seq 1 30); do
  if curl -sS "$GW_URL/multi/headers" 2>/dev/null | grep -q 'X-Trace-Id'; then
    mw_ready="yes"
    echo " ready (after ${i}s)"
    break
  fi
  echo -n "."
  sleep 1
done
if [ -z "$mw_ready" ]; then
  echo
  echo "bundle middleware not executing after 30s (no X-Trace-Id from /multi/headers)"
  docker compose logs gateway 2>&1 | tail -30
  docker compose down -v >/dev/null 2>&1 || true
  exit 1
fi

echo
echo "=== Running e2e tests ==="
FAILED=0
for t in tests/*.sh; do
  name=$(basename "$t" .sh)
  printf '  %-30s ' "$name"
  if bash "$t" >"/tmp/e2e-$name.out" 2>&1; then
    echo "OK"
    head -1 "/tmp/e2e-$name.out" | sed 's/^/    /'
  else
    echo "FAIL"
    sed 's/^/    /' "/tmp/e2e-$name.out"
    FAILED=$((FAILED + 1))
  fi
done

echo
if [ "${KEEP_STACK:-0}" = "1" ]; then
  echo "=== KEEP_STACK=1 → leaving compose stack up (run \`docker compose down -v\` to clean) ==="
else
  echo "=== Tearing down compose stack ==="
  docker compose down -v >/dev/null 2>&1 || true
fi

if [ "$FAILED" -gt 0 ]; then
  echo
  echo "$FAILED test(s) failed."
  exit 1
fi
echo
echo "All e2e tests passed."
