import { NextResponse } from 'next/server';

/**
 * Mirrors assistant/src/interfaces/http/error.rs's `ErrorResponse` exactly
 * (`{code, message, details?}` + matching status codes) so existing callers
 * — svet-ikony's own lib/api.ts and the Tauri admin's src/api/client.ts,
 * both written against the Rust backend's error shape — keep working
 * unchanged when pointed at this API instead.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: string;
  /** Extra response headers (e.g. Retry-After for rate limiting).
   * Deliberately opt-in and empty by default -- every other ApiError kind
   * keeps its existing header-free response shape unchanged. */
  headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static validation(details: string) {
    return new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', details);
  }
  static authentication(details: string) {
    return new ApiError(401, 'AUTHENTICATION_ERROR', 'Authentication failed', details);
  }
  static authorization(details: string) {
    return new ApiError(403, 'AUTHORIZATION_ERROR', 'Authorization failed', details);
  }
  static notFound(details: string) {
    return new ApiError(404, 'NOT_FOUND', 'Resource not found', details);
  }
  static conflict(details: string) {
    return new ApiError(409, 'CONFLICT', 'Conflict', details);
  }
  /** Phase 1D.2 login rate limiting. `retryAfterSeconds` is always >= 1
   * (seconds remaining until the block clears) -- never the exact
   * remaining-attempts count, which would ease enumeration. */
  static rateLimited(details: string, retryAfterSeconds: number) {
    const error = new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', details);
    error.headers = { 'Retry-After': String(retryAfterSeconds) };
    return error;
  }
  static internal(loggedDetail: unknown) {
    console.error('Internal error:', loggedDetail);
    return new ApiError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
  static database(loggedDetail: unknown) {
    console.error('Database error:', loggedDetail);
    return new ApiError(500, 'DATABASE_ERROR', 'Database error occurred');
  }

  toResponse() {
    return NextResponse.json(
      { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) },
      { status: this.status, headers: this.headers }
    );
  }
}

/** Wraps a route handler body so any thrown ApiError (or unexpected error)
 * becomes the same JSON error shape the Rust backend already returns. */
export function withErrors(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error) => {
    if (error instanceof ApiError) return error.toResponse();
    return ApiError.internal(error).toResponse();
  });
}
