# End-to-end tests

These tests build each plugin, deploy it into a real Tyk OSS gateway running in Docker, hit the gateway with HTTP requests, and assert the plugin's effect is observable on the wire.

## What it does

```
examples/<slug>/dist/bundle.zip
        │
        ▼
e2e/stage-bundles.mjs        # recomputes checksum (driver stays "javascript")
        │
        ▼
e2e/bundles/<slug>.zip ──────► python:3.12-alpine on :8500 (bundle-server)
                                            │
                                            ▼ (gateway downloads at boot)
e2e/apps/<slug>.json ───────► tyk-gateway:goja-dev on :18080 (built from goja branch)
                                            │
                                            ▼
e2e/tests/<slug>.sh ──── curl ──► gateway ──► httpbin.org (upstream)
```

## Gateway image

The e2e gateway is **built from the goja branch** — `gateway.Dockerfile` overlays a freshly built binary onto a published base image (see `build-gateway-image.sh`), so it recognises the `"javascript"` driver natively. Bundles are staged as-is; there is **no otto driver swap**. Once goja ships in a public image (Tyk Gateway v5.14+), the custom image (`tyk-gateway:goja-dev`) can be replaced with a stock `tykio/tyk-gateway` tag.

## Run locally

```bash
cd ..  # at repo root
for ex in examples/*/; do (cd "$ex" && npm ci && npm run build:bundle); done
bash e2e/run.sh
```

Set `KEEP_STACK=1` to leave the compose stack up after tests run (useful for poking around with curl).

## Adding a new example

1. Build its bundle (`examples/<slug>/dist/bundle.zip`). `stage-bundles.mjs` auto-discovers any directory under `examples/` with a `dist/bundle.zip`.
2. Add `e2e/apps/<short>.json` with `custom_middleware_bundle: "<slug>.zip"` and `proxy.listen_path: "/<short>/"`.
3. Add `e2e/tests/<short>.sh` that curls the gateway and asserts plugin behavior. Exit 0 on pass, non-zero on fail. The runner aggregates pass/fail across all scripts.

## Multiple plugins on one API

The gateway accepts multiple bundles per API by passing a comma-separated list in the existing `custom_middleware_bundle` string field — every bundle in the list runs in order on the matching hook. `apps/multi-bundle.json` and `tests/multi-bundle.sh` exercise this pattern by composing `pre-trace-id` and `jws-request-signing` on the same `pre` slot, then asserting both `X-Trace-Id` and `X-Signature` reach the upstream.

```jsonc
// apps/multi-bundle.json
{
  "custom_middleware_bundle": "pre-trace-id.zip,jws-request-signing.zip"
}
```

Both bundles export a global named `handler`; the gateway aliases each export under a per-(file, name) IIFE so they coexist without colliding.
