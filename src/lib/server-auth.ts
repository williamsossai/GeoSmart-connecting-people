import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('SESSION_SECRET must be configured with at least 32 bytes before the server starts.');
}

const JWT_ISSUER = 'geosmart-app';
const JWT_AUDIENCE = 'geosmart-client';
const CONFIGURED_ADMIN_UIDS = new Set(
  (process.env.ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean)
);

export function isConfiguredAdminUid(uid: string): boolean {
  return CONFIGURED_ADMIN_UIDS.has(uid);
}

export interface AppUserTokenPayload {
  uid: string;
  email: string;
  name?: string | null;
  sub: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  [key: string]: any;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export function signAppToken(payload: { uid: string; email: string; name?: string | null }): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AppUserTokenPayload = {
    uid: payload.uid,
    email: payload.email,
    name: payload.name || null,
    sub: payload.uid,
    iat: now,
    exp: now + 30 * 24 * 60 * 60, // 30 days expiration
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAppToken(token: string): AppUserTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature.length !== expectedSignature.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload: AppUserTokenPayload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );

    const now = Math.floor(Date.now() / 1000);
    if (
      payload.iss !== JWT_ISSUER ||
      payload.aud !== JWT_AUDIENCE ||
      typeof payload.uid !== 'string' || !payload.uid ||
      payload.sub !== payload.uid ||
      typeof payload.email !== 'string' || !payload.email ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      payload.iat > now + 30 ||
      payload.exp <= payload.iat
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
