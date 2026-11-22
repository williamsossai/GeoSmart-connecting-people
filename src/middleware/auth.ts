import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/repository.ts';
import { users } from '../db/schema.ts';
import { verifyAppToken } from '../lib/server-auth.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken: DecodedIdToken;
  let firebaseToken = false;
  try {
    // 1. Check if token is our server-issued JWT
    const appPayload = verifyAppToken(token);
    if (appPayload) {
      decodedToken = {
        uid: appPayload.uid,
        email: appPayload.email,
        name: appPayload.name || undefined,
        auth_time: appPayload.iat,
        exp: appPayload.exp,
        iat: appPayload.iat,
        sub: appPayload.sub,
        iss: appPayload.iss,
        aud: appPayload.aud,
        firebase: { identities: {}, sign_in_provider: 'password' },
      } as unknown as DecodedIdToken;
    } else {
      // 2. Fall back to Firebase ID token verification (for Google Sign-In)
      decodedToken = await adminAuth.verifyIdToken(token);
      firebaseToken = true;
    }
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  if (firebaseToken && (!decodedToken.email || decodedToken.email_verified !== true)) {
    return res.status(403).json({ error: 'A verified email address is required to use GeoSmart.' });
  }

  req.user = decodedToken;

  // Keep account-storage failures distinct from invalid authentication.
  try {
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@geosmart.local`,
      decodedToken.name || null
    );

    if (dbUser.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended. Please contact platform support.' });
    }

    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Error synchronizing authenticated user with PostgreSQL:', error);
    return res.status(503).json({ error: 'GeoSmart account storage is unavailable. Check the PostgreSQL connection settings and try again.' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  return requireAuth(req, res, () => {
    if (req.dbUser?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrative privileges required' });
    }
    next();
  });
};
