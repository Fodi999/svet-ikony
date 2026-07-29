import { getAdminJwtSecret } from './env';
import { ApiError } from './errors';

/** Mirrors assistant/src/domain (AdminClaims): {sub, role, exp, iat}, HS256,
 * signed with ADMIN_JWT_SECRET (falls back to JWT_SECRET) — see
 * assistant/src/application/admin_auth.rs. Minimal hand-rolled HS256
 * verifier via Web Crypto (available in the Workers runtime) rather than
 * pulling in a JWT dependency for one algorithm. */
export type AdminClaims = {
  sub: string;
  role: string;
  exp: number;
  iat: number;
};

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToString(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyAdminToken(token: string): Promise<AdminClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw ApiError.authentication('Invalid or expired token');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(base64UrlToString(headerB64));
  } catch {
    throw ApiError.authentication('Invalid or expired token');
  }
  if (header.alg !== 'HS256') {
    // The Rust side always signs with jsonwebtoken's default (HS256); a
    // token claiming anything else was never issued by admin_auth.rs.
    throw ApiError.authentication('Invalid or expired token');
  }

  const secret = await getAdminJwtSecret();
  const key = await hmacKey(secret);
  const signature = base64UrlToBytes(signatureB64);
  const signedContent = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('HMAC', key, signature, signedContent);
  if (!valid) {
    throw ApiError.authentication('Invalid or expired token');
  }

  let claims: AdminClaims;
  try {
    claims = JSON.parse(base64UrlToString(payloadB64));
  } catch {
    throw ApiError.authentication('Invalid or expired token');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) {
    throw ApiError.authentication('Invalid or expired token');
  }
  if (claims.role !== 'super_admin') {
    throw ApiError.authorization('Insufficient permissions');
  }
  return claims;
}

/** Mirrors `require_super_admin` middleware — call at the top of every admin
 * route handler. */
export async function requireSuperAdmin(request: Request): Promise<AdminClaims> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw ApiError.authentication('Missing or invalid authorization header');
  }
  return verifyAdminToken(match[1]);
}
