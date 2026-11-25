import type { ErrorCode } from "@/lib/constants";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Datos inválidos", details?: unknown) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "No autenticado") {
    super("UNAUTHORIZED", 401, message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super("FORBIDDEN", 403, message);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado", details?: unknown) {
    super("NOT_FOUND", 404, message, details);
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflicto", details?: unknown) {
    super("CONFLICT", 409, message, details);
  }
}
export class BlockingConflictError extends AppError {
  constructor(message = "Conflicto con un evento bloqueante", details?: unknown) {
    super("BLOCKING_CONFLICT", 409, message, details);
  }
}
export class ConfirmationRequiredError extends AppError {
  constructor(message = "Se requiere confirmación explícita", details?: unknown) {
    super("CONFIRMATION_REQUIRED", 428, message, details);
  }
}
export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number, message = "Demasiadas solicitudes") {
    super("RATE_LIMITED", 429, message, { retryAfterSeconds }, { "Retry-After": String(retryAfterSeconds) });
  }
}
