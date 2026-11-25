export const SESSION_COOKIE = "pc_session";
export const SESSION_TTL_DAYS = 30;
export const TOKEN_PREFIX = "pc_";
export const DEFAULT_TIMEZONE = "America/Santo_Domingo";
export const API_BASE = "/api/v1";

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BLOCKING_CONFLICT: 409,
  CONFIRMATION_REQUIRED: 428,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_CODES | (string & {});
