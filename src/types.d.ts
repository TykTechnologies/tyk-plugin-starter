// TypeScript declarations for the Tyk goja/otto plugin runtime.
//
// These types describe the API exposed inside the gateway's JSVM. They are
// shared between the otto and goja runtimes — both register the same globals
// and pass the same struct shapes across the Go↔JS boundary.
//
// Will move to @tyk-technologies/tyk-plugin-types on npm in a future release.
//
// Casing rule: fields originating from Go structs without JSON tags
// (MiniRequestObject, MiniResponseObject, ReturnOverrides) are exposed in
// PascalCase. Fields from structs with JSON tags (SessionState, AccessDefinition)
// are exposed in snake_case. The TykConfig argument is built from a string-keyed
// map, hence its mixed casing.

declare namespace TykJS {
  namespace TykMiddleware {
    class NewMiddleware {
      constructor(spec: object);
      NewProcessRequest(
        fn: (request: TykRequest, session: TykSession, config: TykConfig) => TykHandlerResult
      ): void;
      NewProcessResponse(
        fn: (response: TykResponse, session: TykSession, config: TykConfig) => TykHandlerResult
      ): void;
      ReturnData(request: TykRequest, sessionMeta: { [key: string]: string }): TykHandlerResult;
      /**
       * For `auth_check` plugins. The session is what the plugin constructs to
       * represent the now-authenticated principal — most fields the gateway
       * populates itself, so a `Partial` is enough. Bind a policy via
       * `apply_policies` if you want the gateway to apply rate/quota.
       */
      ReturnAuthData(request: TykRequest, session: Partial<TykSession>): TykHandlerResult;
      ReturnResponseData(
        response: TykResponse,
        sessionMeta: { [key: string]: string }
      ): TykHandlerResult;
    }
  }
}

// ===== Request middleware =====

interface TykRequest {
  /** Inbound headers, multi-value, as received. Read-only — to modify, use SetHeaders/DeleteHeaders. */
  Headers: { [key: string]: string[] };
  /** Single-value headers to add or overwrite before the request hits upstream. */
  SetHeaders: { [key: string]: string };
  /** Header names to remove. */
  DeleteHeaders: string[];
  /** Request body. Wire format is base64; the coreJS prelude auto-decodes before the hook runs. */
  Body: string;
  /** Reconstructed request URL after path/query mutations are applied. */
  URL: string;
  /** HTTP method (GET, POST, ...). */
  Method: string;
  /** Inbound query parameters, multi-value, as parsed. Read-only — to modify, use AddParams/ExtendedParams/DeleteParams. */
  Params: { [key: string]: string[] };
  /** Single-value query parameters to add or overwrite. */
  AddParams: { [key: string]: string };
  /** Multi-value query parameters to add. */
  ExtendedParams: { [key: string]: string[] };
  /** Query parameter names to remove. */
  DeleteParams: string[];
  /** When set, short-circuits the request with an inline response. */
  ReturnOverrides: TykReturnOverrides;
  /** When true, the gateway preserves the original body even if the plugin modified it. */
  IgnoreBody: boolean;
  /** "http" or "https". */
  Scheme: string;
  /** Raw unprocessed request URI (path + query + fragment, as received on the wire). */
  RequestURI: string;
}

// ===== Response middleware =====

interface TykResponse {
  /** Upstream response status code. Modifiable. */
  StatusCode: number;
  /** Upstream response body as a string (NOT base64 — unlike TykRequest.Body). */
  Body: string;
  /** Upstream response headers, multi-value. Read-only — to modify, use SetHeaders/DeleteHeaders. */
  Headers: { [key: string]: string[] };
  /** Single-value headers to add or overwrite before the response leaves the gateway. */
  SetHeaders: { [key: string]: string };
  /** Header names to strip from the response. */
  DeleteHeaders: string[];
}

// ===== Session =====

interface TykSession {
  /** Friendly identifier for unhashed token tracking in analytics. */
  alias: string;
  /** Owning organization ID. */
  org_id: string;
  /** Custom metadata attached to the key. Modify via the SessionMeta return object, not in place. */
  meta_data: { [key: string]: any };
  /** Requests allowed per `per` seconds. */
  rate: number;
  /** Rate-limit window in seconds. */
  per: number;
  /** Internal allowance counter for the rate limiter. */
  allowance: number;
  /** Per-request smoothing interval in seconds. */
  throttle_interval: number;
  /** Max retries before throttle hard-caps. */
  throttle_retry_limit: number;
  /** Rate-limit smoothing config (advanced). */
  smoothing?: any;
  /** Unix epoch when the key expires. */
  expires: number;
  /** Per-key lifetime override in seconds (overrides the global default). */
  session_lifetime: number;
  /** Action to take after expiry (e.g., revoke, grace). */
  post_expiry_action: string;
  /** Grace period in seconds after expiry. */
  post_expiry_grace_period: number;
  /** Max requests per quota window. */
  quota_max: number;
  /** Unix epoch when the quota next resets. */
  quota_renews: number;
  /** Requests remaining in the current quota window. */
  quota_remaining: number;
  /** Quota window in seconds. */
  quota_renewal_rate: number;
  /** Per-API access definitions, keyed by API ID. */
  access_rights: { [apiId: string]: TykAccessDefinition };
  /** Single bound policy ID (deprecated — use apply_policies). */
  apply_policy_id: string;
  /** Bound policy IDs. */
  apply_policies: string[];
  /** OAuth client ID, if applicable. */
  oauth_client_id: string;
  /** OAuth tokens, if applicable. */
  oauth_keys: { [id: string]: string };
  /** Certificate fingerprint, if mTLS auth is in play. */
  certificate: string;
  /** Static cert bindings for mTLS. */
  mtls_static_certificate_bindings: string[];
  /** RSA cert ID, if RSA-signed JWT auth is in play. */
  rsa_certificate_id: string;
  /** Basic-auth credentials. `password` is the server-side hashed value. */
  basic_auth_data: { password: string; hash_type: string };
  /** JWT-auth signing config. */
  jwt_data: { secret: string };
  /** Whether HMAC signature checking is enabled for this key. */
  hmac_enabled: boolean;
  /** Whether HTTP signature validation is enabled. */
  enable_http_signature_validation: boolean;
  /** HMAC shared secret. */
  hmac_string: string;
  /** When true, the key is disabled and access is denied. */
  is_inactive: boolean;
  /** Analytics retention window in seconds. */
  data_expires: number;
  /** Quota / rate-limit trigger thresholds. */
  monitor: { trigger_limits: number[] };
  /** Deprecated — prefer `enable_detailed_recording`. */
  enable_detail_recording: boolean;
  /** When true, the gateway records full request/response payloads in analytics. */
  enable_detailed_recording: boolean;
  /** Analytics tags. */
  tags: string[];
  /** ISO timestamp of the last update. */
  last_updated: string;
  /** Unix epoch beyond which a cached extracted ID is no longer valid. */
  id_extractor_deadline: number;
  /** GraphQL: max query depth permitted for this key. */
  max_query_depth: number;
  /** ISO timestamp when the key was created. */
  date_created: string;
  /** Deprecated — internal rate-limiter checkpoint. */
  last_check: number;
}

interface TykAccessDefinition {
  api_name: string;
  api_id: string;
  versions: string[];
  allowed_urls: { url: string; methods: string[] }[];
  /** Per-API rate-limit override. */
  limit?: { rate: number; per: number; quota_max: number };
}

// ===== Config =====

interface TykConfig {
  /** Custom config blob attached to the API definition (`config_data` on the spec). */
  config_data: { [key: string]: any };
  /** API ID — always populated by the gateway. */
  APIID: string;
  /** Owning organization ID — always populated by the gateway. */
  OrgID: string;
}

// ===== Return overrides + handler result =====

interface TykReturnOverrides {
  /** When non-zero, short-circuits with this status code. */
  ResponseCode: number;
  /** Error message; the gateway also writes this into ResponseBody on its own. */
  ResponseError: string;
  /** Response body to return when overriding. */
  ResponseBody: string;
  /** Headers to set on the override response. */
  ResponseHeaders: { [key: string]: string };
  /** When true, ResponseError is treated as the response body (no error wrapping). */
  OverrideError: boolean;
}

interface TykHandlerResult {
  Request: TykRequest;
  Response?: TykResponse;
  SessionMeta?: { [key: string]: string };
  Session?: TykSession;
  AuthValue?: string;
}

// ===== Globals registered by the gateway =====

/**
 * Issues a synchronous outbound HTTP call from the goja runtime.
 *
 * Argument is a JSON string matching `TykHttpRequestSpec`.
 * Returns a JSON string matching `TykHttpResponseRaw`, or `undefined` on transport error.
 */
declare function TykMakeHttpRequest(jsonConfig: string): string | undefined;

/** Reads session/key data. Returns a JSON string of `TykSession` (empty `{}` on miss). */
declare function TykGetKeyData(apiKey: string, apiId: string): string;

/**
 * Writes session data for a key.
 * `suppressReset` is a string; pass `"1"` to skip session reset, anything else to reset.
 */
declare function TykSetKeyData(apiKey: string, sessionJson: string, suppressReset: string): void;

/** Issues a batch of HTTP requests. Argument is a JSON string. Returns JSON string or `undefined` on error. */
declare function TykBatchRequest(requestSet: string): string | undefined;

/** Writes a structured info-level log line via the gateway's logrus logger. */
declare function log(msg: string): void;

/** Writes a raw log line (no structured fields; trailing newline added). */
declare function rawlog(msg: string): void;

/** Standard base64 encode (RFC 4648). */
declare function b64enc(s: string): string;

/** Standard base64 decode (RFC 4648, with RawStdEncoding fallback). Returns empty/undefined on malformed input. */
declare function b64dec(s: string): string;

/** Raw base64 encode (URL-safe, no padding). */
declare function rawb64enc(s: string): string;

/** Raw base64 decode (URL-safe, no padding). Returns empty/undefined on malformed input. */
declare function rawb64dec(s: string): string;

// ===== Helper types for the JSON-string contracts =====

/** Argument shape for `TykMakeHttpRequest` (serialize to JSON before passing). */
interface TykHttpRequestSpec {
  Method: string;
  Body?: string;
  Headers?: { [key: string]: string };
  /** Origin including scheme, e.g. "http://example.com". */
  Domain: string;
  /** Path + query, e.g. "/api/v1/widgets". */
  Resource: string;
  /** Mutually exclusive with Body — sets `application/x-www-form-urlencoded` form fields. */
  FormData?: { [key: string]: string };
}

/** Result shape returned by `TykMakeHttpRequest` (parse from JSON). */
interface TykHttpResponseRaw {
  code: number;
  body: string;
  headers: { [key: string]: string[] };
}

// ===== Manifest constants =====

/** Driver values valid in `manifest.json#/custom_middleware/driver`. */
type TykPluginDriver =
  | "javascript"
  | "otto"
  | "python"
  | "lua"
  | "grpc"
  | "goplugin";

/** Hook keys valid under `manifest.json#/custom_middleware`. One plugin = one hook. */
type TykMiddlewareHook =
  | "pre"
  | "post"
  | "post_key_auth"
  | "auth_check"
  | "response";
