// TypeScript declarations for the Tyk goja plugin runtime.
// These types describe the API surface available inside the gateway.
// They will move to @tyk/plugin-types on npm in a future release.

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
      ReturnData(request: TykRequest, sessionMeta: object): TykHandlerResult;
      ReturnAuthData(request: TykRequest, session: TykSession): TykHandlerResult;
      ReturnResponseData(response: TykResponse, sessionMeta: object): TykHandlerResult;
    }
  }
}

interface TykRequest {
  Headers: { [key: string]: string[] };
  SetHeaders: { [key: string]: string };
  DeleteHeaders: string[];
  Body: string;
  URL: string;
  Method: string;
  Params: { [key: string]: string[] };
  AddParams: { [key: string]: string };
  ExtendedParams: { [key: string]: string };
  DeleteParams: string[];
  ReturnOverrides: TykReturnOverrides;
  IgnoreBody: boolean;
  Scheme: string;
}

interface TykResponse {
  Headers: { [key: string]: string };
  MultivalueHeaders: { [key: string]: string[] };
  Body: string;
  StatusCode: number;
}

interface TykSession {
  alias: string;
  org_id: string;
  meta_data: { [key: string]: string };
  rate: number;
  per: number;
  expires: number;
  quota_max: number;
  quota_remaining: number;
  quota_renewal_rate: number;
  access_rights: { [key: string]: TykAccessDefinition };
  apply_policy_id: string;
  apply_policies: string[];
  oauth_client_id: string;
  oauth_keys: { [key: string]: string };
  certificate: string;
  basic_auth_data: { password: string; hash_type: string };
  jwt_data: { secret: string };
  monitor: { trigger_limits: number[] };
  metadata: { [key: string]: string };
  tags: string[];
  enable_detail_recording: boolean;
  enable_detail_recording_v2: boolean;
}

interface TykAccessDefinition {
  api_name: string;
  api_id: string;
  versions: string[];
  allowed_urls: { url: string; methods: string[] }[];
  limit?: { rate: number; per: number; quota_max: number };
}

interface TykConfig {
  config_data: { [key: string]: any };
  APIID?: string;
  OrgID?: string;
}

interface TykReturnOverrides {
  ResponseCode: number;
  ResponseError: string;
  ResponseBody: string;
  ResponseHeaders: { [key: string]: string };
  OverrideError: boolean;
}

interface TykHandlerResult {
  Request: TykRequest;
  Response?: TykResponse;
  SessionMeta?: { [key: string]: string };
  Session?: TykSession;
  AuthValue?: string;
}

// Globals exposed by the gateway runtime.
declare function TykMakeHttpRequest(jsonConfig: string): string;
declare function TykGetKeyData(apiKey: string, apiId: string): string;
declare function TykSetKeyData(apiKey: string, sessionJson: string, suppressReset: string): void;
declare function TykBatchRequest(requestSet: string): string;
declare function log(msg: string): void;
declare function rawlog(msg: string): void;
declare function b64enc(s: string): string;
declare function b64dec(s: string): string;
declare function rawb64enc(s: string): string;
declare function rawb64dec(s: string): string;
