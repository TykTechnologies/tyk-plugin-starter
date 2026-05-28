# Post Key-Auth Tenant Context

Forward the authenticated key's tenant identity to upstream services as `X-Tenant-Id`. Runs in the `post_key_auth` phase so the session is already populated by the gateway's built-in key authentication.

## When to use

- Multi-tenant upstream services that key off a header rather than re-parsing the API key
- Any time you've stored tenancy in `meta_data` on the key and want it propagated transparently
- A canonical example of reading session state and shaping the upstream request — no I/O, no deps

## What it does

On every authenticated request:

1. Reads `session.meta_data.tenant_id`
2. Coerces it to a string (the field is typed `any`, so numbers are tolerated)
3. If non-empty, sets `X-Tenant-Id: <tenantId>` on the upstream request and logs `applied`
4. If missing/empty, logs a `WARN` and lets the request through unchanged — auth already passed, so this hook does not reject

## Configure

On the API key's session metadata:

```json
{
  "meta_data": {
    "tenant_id": "acme-co"
  }
}
```

The manifest sets `require_session: true` because this hook depends on a populated session.

## Try it

```bash
npm install
npm test
npm run build:bundle    # dist/bundle.zip
```

## Notes

- This is **enrichment, not authorization**. Auth has already run by the time `post_key_auth` fires. If you need to deny a request lacking a tenant, do it earlier (in `auth_check`) or in upstream policy.
- `meta_data` is `{[key: string]: any}` — strings, numbers, booleans, objects all reach you. The plugin only handles primitives sensibly; if you store `tenant_id` as an object, expect `[object Object]` and rethink the schema.
- No external deps — pure JS, no `crypto-js` or `uuid` here.
