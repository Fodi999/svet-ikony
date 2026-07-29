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
      { status: this.status }
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
