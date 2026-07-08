# Idempotency Guard

Reject duplicate requests that reuse an `Idempotency-Key` header, using the gateway's shared storage bindings (`TykStorage*`). Demonstrates the **atomic SetNX claim pattern** — the canonical way to do "first one wins" across gateway workers without a read-then-write race.

## What it does

On the `pre` hook:

1. Reads the `Idempotency-Key` request header. **No header → pass through** (idempotency is client opt-in).
2. Calls `TykStorageSetNX('idem:' + key, 'pending', 60)` — an atomic "set if not exists" against the gateway's Redis.
   - **Claimed (true)** → this is the first request with that key. Pass through.
   - **Not claimed (false)** → a request with the same key already ran within the last 60s. Return **409 Conflict**.
3. If storage itself errors, the plugin **fails closed** with a 500 — without the guard it can't rule out a duplicate side effect, so refusing is safer than letting it through.

The claim expires after 60 seconds (`CLAIM_TTL_SECONDS` in `src/plugin.ts`) — tune it to your clients' retry window.

## Why SetNX and not Get-then-Set?

Two concurrent requests with the same key would both `Get` (miss), then both `Set` and both proceed. `TykStorageSetNX` collapses check-and-claim into one atomic Redis operation, so exactly one request wins even under concurrency.

## Caveat: atomicity scope

Atomicity is **per Redis instance**. Each gateway's `TykStorage*` bindings talk to that gateway's configured Redis — in a multi-node **hybrid** deployment where data planes run separate Redis instances, each Redis enforces the guard independently. For a **global** guarantee, all gateways enforcing the guard must share the same Redis.

## Try it

```bash
npm install
npm test                # pure Node, no gateway needed
npm run build:bundle    # dist/bundle.zip
```

```bash
curl -X POST localhost:8080/<plugin>/post -H 'Idempotency-Key: order-123'   # 200 — claimed
curl -X POST localhost:8080/<plugin>/post -H 'Idempotency-Key: order-123'   # 409 — duplicate
```

## Notes

- `TykStorage*` bindings throw on invalid input: empty key, key > 256 bytes, value > 64KB. The test harness enforces the same limits, so violations surface in `npm test`, not in production.
- This guard only *blocks* duplicates; it doesn't *replay* the first response (full idempotency-key semantics à la Stripe). For that you'd `TykStorageSet` the response on the `response` hook and serve it from storage on a duplicate.
- The bindings aren't in `@tyk-technologies/tyk-plugin-types` yet — the plugin carries a local `declare function` for `TykStorageSetNX`.
