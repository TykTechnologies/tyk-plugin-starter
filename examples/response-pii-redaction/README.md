# Response PII Redaction

Scrub US Social Security Numbers from upstream response bodies before they reach the client. Compliance-friendly belt-and-braces for endpoints that occasionally over-share.

## When to use

- Legacy upstream services you cannot modify but cannot let leak SSNs
- Regulated environments where defence-in-depth requires gateway-side scrubbing
- Anywhere a regex-based, fail-closed redactor is preferable to trusting the upstream

## What it does

On every response (after upstream returns, before the client receives):

1. Reads `response.Body` as a string.
2. Replaces every `NNN-NN-NNNN` substring with `***-**-****`.
3. Leaves status code, headers, and all other fields untouched.
4. No-ops on an empty body or a body with no matches.

## Configure

Nothing to configure. The pattern and mask are baked in.

## Try it

```bash
npm install
npm test
npm run build:bundle    # dist/bundle.zip
```

## Notes

- Hook: `response`. One plugin = one hook. Use `handler.ReturnResponseData(...)` (NOT `ReturnData`) — see `manifest.json#/custom_middleware/response`.
- The regex is greedy on shape, not semantics: `999-99-9999` is masked too, even though it isn't a valid SSN. That is the right behaviour for a redactor — better to scrub a non-SSN than to leak one.
- This pattern does not enforce word boundaries, so it will match an SSN inside a longer digit run (e.g. `XYZ-123-45-6789-ABC` → `XYZ-***-**-****-ABC`). For most response bodies that is desirable. If you need stricter matching, tighten `SSN_PATTERN` in `src/plugin.ts`.
- This plugin deliberately stays within the **ES5.1 floor** (no `?.`, no `??`, no async) so it runs on any goja-enabled gateway and even the legacy otto driver. goja v5.14+ does support `?.`/`??`, but ES5.1 is the guaranteed surface — keep to it when you want maximum portability.
