# rate-limiter

A per-caller **fixed-window rate limit** implemented in a `pre` plugin, backed by
the gateway's shared storage bindings. Each caller gets `LIMIT` requests per
`WINDOW_SECONDS`; the request that tips them over is rejected with `429` and a
`Retry-After` header.

## Why this shows off the storage bindings

The whole limiter is one atomic call:

```ts
count = parseInt(TykStorageIncr(key, WINDOW_SECONDS), 10);
```

`TykStorageIncr` is `INCR` against the gateway's Redis (with a TTL applied), so
concurrent requests increment the same counter **atomically** — no
read-then-write race, which is exactly the trap a naive `TykStorageGet` +
`TykStorageSet` limiter falls into. This complements
[`idempotency-guard`](../idempotency-guard/), which uses the other atomic
primitive, `TykStorageSetNX`.

## How the window works

The counter key is bucketed by window number:

```
ratelimit:<caller>:<floor(now / WINDOW_SECONDS)>
```

Because the key changes when the window rolls over, each window starts from zero
with no separate reset step — the TTL just garbage-collects the old keys. The
caller is taken from the `X-Client-Id` header (falling back to `anonymous`), so
each client is limited independently.

## Fail-open

If storage is unavailable the plugin **fails open** (lets the request through).
A rate limit is an availability control, so a limiter outage shouldn't take the
API down — the opposite choice from `idempotency-guard`, which fails *closed*
because an idempotency check is a correctness control.

## Tuning

Edit the constants at the top of [`src/plugin.ts`](./src/plugin.ts):

```ts
var LIMIT = 5;           // requests allowed per window, per caller
var WINDOW_SECONDS = 60; // window length
```

## Try it

```bash
npm install
npm test              # unit tests, pure Node (storage is mocked by the harness)
npm run build         # dist/plugin.js
npm run build:bundle  # dist/bundle.zip for the bundle deploy path
```

Against a real gateway (see [`e2e/`](../../e2e/)):

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/ratelimit/get -H 'X-Client-Id: acme'
done
# → 200 200 200 200 200 429
```
