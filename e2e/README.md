# End-to-end tests

These tests build each plugin, deploy it into a real Tyk OSS gateway running in Docker, hit the gateway with HTTP requests, and assert the plugin's effect is observable on the wire.

## What it does

```
examples/<slug>/dist/bundle.zip
        │
        ▼
e2e/stage-bundles.mjs        # swaps driver "javascript" → "otto", recomputes checksum
        │
        ▼
e2e/bundles/<slug>.zip ──────► python:3.12-alpine on :8500 (bundle-server)
                                            │
                                            ▼ (gateway downloads at boot)
e2e/apps/<slug>.json ───────► tykio/tyk-gateway:v5.7 on :8080
                                            │
                                            ▼
e2e/tests/<slug>.sh ──── curl ──► gateway ──► httpbin.org (upstream)
```

## Why driver "otto" instead of "javascript"

The current public Tyk OSS image is pre-goja-merge — its `isJSDriver()` only recognises `"otto"`. The plugin code is identical between otto and goja (same `MiniRequestObject`, same `TykJS` prelude, same registered globals), so swapping just the manifest field is enough. When the goja branch merges and a public image with `"javascript"` driver support ships, delete the swap logic in `stage-bundles.mjs`.

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
