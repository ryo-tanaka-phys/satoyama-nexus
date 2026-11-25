import { createHash, randomBytes } from 'node:crypto';

export const VENUE_SESSION_COOKIE_NAME = 'satoyama_demo_session';
export const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours for live demo day

const FORBIDDEN_CLIENT_AUTH_KEYS = new Set([
  'role',
  'roles',
  'grants',
  'permissions',
  'userAccountId',
  'reviewerId',
  'operatedActorIds'
]);

/** Generates a 256-bit cryptographically random opaque session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Computes a deterministic 64-char SHA-256 hex digest for storage in simulation.demo_session. */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/** Extracts the raw session token from a Cookie request header, if present. */
export function extractSessionTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const part of pairs) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== VENUE_SESSION_COOKIE_NAME) continue;
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    return value.length > 0 ? value : null;
  }
  return null;
}

/** Builds a secure HttpOnly Set-Cookie header value for demo sessions. */
export function buildSessionSetCookieHeader(
  rawToken: string,
  options?: { maxAgeSeconds?: number; secure?: boolean }
): string {
  const maxAge = options?.maxAgeSeconds ?? Math.floor(DEFAULT_SESSION_TTL_MS / 1000);
  const parts = [
    `${VENUE_SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (options?.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(options?: { secure?: boolean }): string {
  const parts = [
    `${VENUE_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (options?.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Rejects any client-supplied authority spoofing fields (M1 D07 invariant).
 * Returns the first offending key or null if clean.
 */
export function findSpoofedClientAuthKey(payload: Record<string, unknown>): string | null {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_CLIENT_AUTH_KEYS.has(key)) {
      return key;
    }
  }
  return null;
}
