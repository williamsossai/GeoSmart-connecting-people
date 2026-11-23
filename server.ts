import express from 'express';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import { requireAuth, requireAdmin, AuthRequest } from './src/middleware/auth.ts';
import {
  getUserOverview,
  updateUserProfile,
  completeOnboarding,
  getUserPlaces,
  addPlaceConnection,
  updatePlaceConnection,
  removePlaceConnection,
  getUserCommunities,
  addCommunityConnection,
  removeCommunityConnection,
  getUserFamily,
  getUserFamilyTree,
  addFamilyMember,
  updateFamilyRelationship,
  removeRelationship,
  createFamilyInvitation,
  getFamilyInvitations,
  getFamilyInvitationNotificationState,
  markFamilyInvitationActivityRead,
  setFamilyInvitationAlertsEnabled,
  acceptFamilyInvitation,
  connectRegisteredUserToPerson,
  getKinshipDiscoverySuggestions,
  claimDiscoveredPerson,
  getFamilyStories,
  createFamilyStory,
  getFamilyStoryStoragePath,
  deleteFamilyStory,
  exportUserData,
  deleteUserAccount,
  getAdminMetrics,
  getAdminRecentActivity,
  getAdminUsersList,
  adminUpdateUserStatus,
  getAdminLogs,
  seedDemoScenario,
  registerWithPassword,
  loginWithPassword,
} from './src/db/repository.ts';
import { db, shouldUseMockDatabase } from './src/db/index.ts';
import { sql } from 'drizzle-orm';
import { CountryStateCity } from '@tansuasici/country-state-city';
import {
  deleteFamilyStoryObject,
  fetchFamilyStoryObject,
  getFamilyStoryStorageStatus,
  uploadFamilyStoryObject,
} from './src/lib/family-story-storage.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const startTime = Date.now();

app.use(express.json({ limit: '32kb' }));

type RateLimitBucket = { count: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateLimitBucket>();
function createIpRateLimit(limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = `${req.socket.remoteAddress || 'unknown'}:${req.path}`;
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    }
    if (rateLimitBuckets.size > 5000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
      }
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
    }
    next();
  };
}
const loginRateLimit = createIpRateLimit(10, 15 * 60 * 1000);
const registrationRateLimit = createIpRateLimit(5, 60 * 60 * 1000);
const invitationRateLimit = createIpRateLimit(5, 15 * 60 * 1000);

// Public health check
app.get('/api/health', async (req, res) => {
  try {
    if (await shouldUseMockDatabase()) {
      return res.json({
        status: 'ok',
        database: 'mock',
        dbLatencyMs: 0,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      });
    }
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - t0;

    res.json({
      status: 'ok',
      database: 'connected',
      dbLatencyMs,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: 'Database connection error',
    });
  }
});

// --- Public Authentication Endpoints (Email & Password) ---
app.post('/api/auth/register', registrationRateLimit, async (req, res) => {
  try {
    if (!(await shouldUseMockDatabase())) {
      return res.status(503).json({ error: 'Email/password registration is unavailable until a verified email delivery flow is configured. Please use Google sign-in.' });
    }
    const { email, password, displayName } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';
    const cleanName = typeof displayName === 'string' ? displayName.trim().slice(0, 120) : undefined;
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (cleanPassword.length < 8 || cleanPassword.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    }
    const result = await registerWithPassword(cleanEmail, cleanPassword, cleanName || null);
    res.status(201).json(result);
  } catch (error: any) {
    if (String(error?.message || '').includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Registration error:', error);
    if (String(error?.message || '').startsWith('Failed query:')) {
      return res.status(503).json({ error: 'GeoSmart account storage is unavailable. Check the PostgreSQL connection settings and try again.' });
    }
    res.status(400).json({ error: error.message || 'Registration failed.' });
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await loginWithPassword(email, password);
    res.json(result);
  } catch (error: any) {
    if (String(error?.message || '').startsWith('Failed query:')) {
      console.error('Login database error:', error);
      return res.status(503).json({ error: 'GeoSmart account storage is unavailable. Check the PostgreSQL connection settings and try again.' });
    }
    res.status(401).json({ error: error.message || 'Invalid email or password.' });
  }
});

// --- Authenticated User Endpoints ---

// Standard country > region > populated-place selectors for family origins.
app.get('/api/locations/countries', (_req, res) => {
  try {
    const countries = CountryStateCity.getAllCountries();
    if (!Array.isArray(countries)) throw new Error('Country data is not available');
    res.json(countries
      .map(({ id, iso2, name }) => ({ id, code: iso2, name }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('Error in GET /api/locations/countries:', error);
    res.status(500).json({ error: 'Failed to load countries' });
  }
});

app.get('/api/locations/regions', (req, res) => {
  const countryCode = String(req.query.countryCode || '').trim().toUpperCase();
  if (!countryCode) return res.status(400).json({ error: 'Country code is required' });
  try {
    const regions = CountryStateCity.getStatesByCountryCode(countryCode);
    if (!Array.isArray(regions)) throw new Error('Region data is not available');
    res.json(regions
      .map(({ id, stateCode, name }) => ({ id, code: stateCode, name }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('Error in GET /api/locations/regions:', error);
    res.status(500).json({ error: 'Failed to load regions' });
  }
});

app.get('/api/locations/districts', (req, res) => {
  const countryCode = String(req.query.countryCode || '').trim().toUpperCase();
  const regionId = req.query.regionId ? Number.parseInt(String(req.query.regionId), 10) : null;
  if (!countryCode || (req.query.regionId && !Number.isInteger(regionId))) {
    return res.status(400).json({ error: 'A valid country and region are required' });
  }
  try {
    const rawDistricts = regionId
      ? CountryStateCity.getDistrictsByStateId(regionId)
      : CountryStateCity.getDistrictsByCountryCode(countryCode);
    const districts = Array.isArray(rawDistricts) ? rawDistricts : [];
    res.json(districts
      .filter((district) => district.countryCode.toUpperCase() === countryCode)
      .map(({ id, name, stateName, stateId }) => ({ id, name, stateName, regionId: stateId }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('Error in GET /api/locations/districts:', error);
    res.status(500).json({ error: 'Failed to load districts' });
  }
});

app.get('/api/locations/places', (req, res) => {
  const countryCode = String(req.query.countryCode || '').trim().toUpperCase();
  const regionId = req.query.regionId ? Number.parseInt(String(req.query.regionId), 10) : null;
  if (!countryCode || (req.query.regionId && !Number.isInteger(regionId))) {
    return res.status(400).json({ error: 'A valid country and region are required' });
  }
  try {
    const country = CountryStateCity.getCountryByIso2(countryCode);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    if (regionId) {
      const region = CountryStateCity.getStateById(regionId);
      if (!region || region.countryCode !== countryCode) {
        return res.status(400).json({ error: 'Region does not belong to the selected country' });
      }
    }
    const places = regionId
      ? CountryStateCity.getCitiesByStateId(regionId)
      : CountryStateCity.getCitiesByCountryId(country.id);
    if (!Array.isArray(places)) throw new Error('Place data is not available');
    res.json(places
      .map(({ id, name, stateName, stateCode }) => ({
        id,
        name,
        country: country.name,
        countryCode: country.iso2,
        stateRegion: stateName || null,
        stateCode: stateCode || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('Error in GET /api/locations/places:', error);
    res.status(500).json({ error: 'Failed to load places' });
  }
});

// 1. Overview & Identity
app.get('/api/user/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const overview = await getUserOverview(req.dbUser!.id);
    res.json(overview);
  } catch (error: any) {
    console.error('Error in /api/user/overview:', error);
    res.status(500).json({ error: 'Failed to retrieve user overview' });
  }
});

// 2. Profile Update
app.patch('/api/user/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await updateUserProfile(req.dbUser!.id, req.body);
    res.json(updated);
  } catch (error: any) {
    console.error('Error in /api/user/profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// 3. Complete Onboarding
app.post('/api/user/onboarding', requireAuth, async (req: AuthRequest, res) => {
  try {
    await completeOnboarding(req.dbUser!.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/user/onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// 4. Places
app.get('/api/places', requireAuth, async (req: AuthRequest, res) => {
  try {
    const placesList = await getUserPlaces(req.dbUser!.id);
    res.json(placesList);
  } catch (error: any) {
    console.error('Error in GET /api/places:', error);
    res.status(500).json({ error: 'Failed to retrieve places' });
  }
});

app.post('/api/places', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, country, stateRegion, districtLga, townCity, villageLocality, placeType, connectionType, humanLabel, isCurrent, notes, visibility, forPersonId } = req.body;
    if (!name || !country || !connectionType) {
      return res.status(400).json({ error: 'Place name, country, and connection type are required' });
    }
    const connection = await addPlaceConnection(req.dbUser!.id, {
      name,
      country,
      stateRegion,
      districtLga,
      townCity,
      villageLocality,
      placeType,
      connectionType,
      humanLabel,
      isCurrent,
      notes,
      visibility,
      forPersonId,
    });
    res.status(201).json(connection);
  } catch (error: any) {
    console.error('Error in POST /api/places:', error);
    res.status(500).json({ error: 'Failed to connect place' });
  }
});

app.patch('/api/places/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const connectionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(connectionId) || connectionId < 1) {
      return res.status(400).json({ error: 'A valid place connection is required' });
    }
    const { name, country, stateRegion, districtLga, townCity, villageLocality, placeType, connectionType, humanLabel, isCurrent, notes, visibility } = req.body;
    if (!name || !country || !connectionType) {
      return res.status(400).json({ error: 'Place name, country, and connection type are required' });
    }
    const result = await updatePlaceConnection(req.dbUser!.id, connectionId, {
      name,
      country,
      stateRegion,
      districtLga,
      townCity,
      villageLocality,
      placeType,
      connectionType,
      humanLabel,
      isCurrent,
      notes,
      visibility,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error in PATCH /api/places/:id:', error);
    if (String(error?.message || '').includes('not found or permission denied')) {
      return res.status(404).json({ error: 'Place connection not found.' });
    }
    res.status(500).json({ error: 'Failed to update place connection' });
  }
});

app.delete('/api/places/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const connectionId = parseInt(req.params.id, 10);
    const result = await removePlaceConnection(req.dbUser!.id, connectionId);
    res.json(result);
  } catch (error: any) {
    console.error('Error in DELETE /api/places/:id:', error);
    res.status(500).json({ error: 'Failed to remove place connection' });
  }
});

// 5. Communities
app.get('/api/communities', requireAuth, async (req: AuthRequest, res) => {
  try {
    const communitiesList = await getUserCommunities(req.dbUser!.id);
    res.json(communitiesList);
  } catch (error: any) {
    console.error('Error in GET /api/communities:', error);
    res.status(500).json({ error: 'Failed to retrieve communities' });
  }
});

app.post('/api/communities', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, communityType, description, associatedPlaceId, connectionType, humanLabel, notes, visibility } = req.body;
    if (!name || !connectionType) {
      return res.status(400).json({ error: 'Community name and connection type are required' });
    }
    const connection = await addCommunityConnection(req.dbUser!.id, {
      name,
      communityType,
      description,
      associatedPlaceId,
      connectionType,
      humanLabel,
      notes,
      visibility,
    });
    res.status(201).json(connection);
  } catch (error: any) {
    console.error('Error in POST /api/communities:', error);
    res.status(500).json({ error: 'Failed to connect community' });
  }
});

app.delete('/api/communities/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const connectionId = parseInt(req.params.id, 10);
    const result = await removeCommunityConnection(req.dbUser!.id, connectionId);
    res.json(result);
  } catch (error: any) {
    console.error('Error in DELETE /api/communities/:id:', error);
    res.status(500).json({ error: 'Failed to remove community connection' });
  }
});

// 6. Family & Relationships
app.get('/api/family', requireAuth, async (req: AuthRequest, res) => {
  try {
    const family = await getUserFamily(req.dbUser!.id);
    res.json(family);
  } catch (error: any) {
    console.error('Error in GET /api/family:', error);
    res.status(500).json({ error: 'Failed to retrieve family connections' });
  }
});

// Full visual tree hierarchy
app.get('/api/family/tree', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tree = await getUserFamilyTree(req.dbUser!.id);
    res.json(tree);
  } catch (error: any) {
    console.error('Error in GET /api/family/tree:', error);
    res.status(500).json({ error: 'Failed to generate family tree' });
  }
});

app.get('/api/family/stories', requireAuth, async (req: AuthRequest, res) => {
  try {
    const storage = await getFamilyStoryStorageStatus();
    const stories = await getFamilyStories(req.dbUser!.id);
    res.json({ stories, storageReady: storage.ready, storageMessage: storage.message });
  } catch (error) {
    console.error('Error in GET /api/family/stories:', error);
    res.status(503).json({ error: 'Family stories are not available yet. Apply the database migrations and configure private media storage.' });
  }
});

app.post(
  '/api/family/stories',
  requireAuth,
  express.raw({ type: ['audio/*', 'video/*'], limit: '50mb' }),
  async (req: AuthRequest, res) => {
    let storagePath: string | null = null;
    let uploaded = false;
    try {
      const storage = await getFamilyStoryStorageStatus();
      if (!storage.ready) return res.status(503).json({ error: storage.message || 'Private media storage is unavailable.' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Choose an audio or video file to upload.' });
      }
      const decodeStoryHeader = (value: string | undefined) => {
        if (!value) return '';
        try { return decodeURIComponent(value).trim(); } catch { return value.trim(); }
      };
      const title = decodeStoryHeader(req.header('x-story-title'));
      const description = decodeStoryHeader(req.header('x-story-description'));
      const visibility = String(req.header('x-story-visibility') || 'private');
      const consentConfirmed = req.header('x-story-consent') === 'true';
      const contentType = String(req.header('content-type') || '').split(';')[0].trim().toLowerCase();
      const allowedTypes = new Set([
        'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/x-m4a',
        'video/mp4', 'video/quicktime', 'video/webm',
      ]);
      if (!title || title.length > 120) return res.status(400).json({ error: 'Enter a title up to 120 characters.' });
      if (description.length > 1200) return res.status(400).json({ error: 'Description must be 1,200 characters or fewer.' });
      if (!allowedTypes.has(contentType)) return res.status(400).json({ error: 'Use an MP4, WebM, MP3, OGG, M4A, or QuickTime audio/video file.' });
      if (visibility !== 'private' && visibility !== 'family') return res.status(400).json({ error: 'Choose private or direct family sharing.' });
      if (!consentConfirmed) return res.status(400).json({ error: 'Confirm you have permission from living people featured in this story.' });

      const userId = req.dbUser!.id;
      storagePath = `${userId}/${randomUUID()}`;
      await uploadFamilyStoryObject(storagePath, contentType, req.body);
      uploaded = true;
      const result = await createFamilyStory(userId, {
        title,
        description,
        storagePath,
        contentType,
        mediaType: contentType.startsWith('audio/') ? 'audio' : 'video',
        fileSize: req.body.length,
        visibility: visibility as 'private' | 'family',
        consentVersion: 'family-story-consent-v1',
      });
      res.status(201).json(result);
    } catch (error: any) {
      if (uploaded && storagePath) {
        try { await deleteFamilyStoryObject(storagePath); } catch (cleanupError) {
          console.error('Could not clean up an incomplete family story upload:', cleanupError);
        }
      }
      console.error('Error in POST /api/family/stories:', error);
      res.status(500).json({ error: 'Could not save this story. Please try again.' });
    }
  },
);

app.get('/api/family/stories/:id/media', requireAuth, async (req: AuthRequest, res) => {
  try {
    const storyId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(storyId) || storyId < 1) return res.status(400).json({ error: 'A valid story is required.' });
    const storagePath = await getFamilyStoryStoragePath(req.dbUser!.id, storyId);
    const media = await fetchFamilyStoryObject(storagePath, req.header('range') || undefined);
    if (!media.ok && media.status !== 206) return res.status(502).json({ error: 'Story media could not be loaded.' });
    res.setHeader('Content-Type', media.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      const value = media.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.status(media.status);
    if (media.body) Readable.fromWeb(media.body as any).pipe(res);
    else res.end();
  } catch (error: any) {
    console.error('Error in GET /api/family/stories/:id/media:', error);
    const status = String(error?.message || '').includes('access') ? 403 : 404;
    res.status(status).json({ error: 'Story not found or you do not have access.' });
  }
});

app.delete('/api/family/stories/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const storyId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(storyId) || storyId < 1) return res.status(400).json({ error: 'A valid story is required.' });
    const result = await deleteFamilyStory(req.dbUser!.id, storyId);
    res.json(result);
  } catch (error: any) {
    console.error('Error in DELETE /api/family/stories/:id:', error);
    res.status(404).json({ error: 'Story not found or could not be deleted.' });
  }
});

app.post('/api/family', requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      firstName,
      lastName,
      otherNames,
      gender,
      birthDate,
      isLiving,
      relationshipType,
      notes,
      visibility,
      placeOfOrigin,
      existingPersonId,
      connectExistingUserId,
      connectUserEmail,
    } = req.body;
    if (!firstName || !lastName || !relationshipType) {
      return res.status(400).json({ error: 'First name, last name, and relationship type are required' });
    }
    const result = await addFamilyMember(req.dbUser!.id, {
      firstName,
      lastName,
      otherNames,
      gender,
      birthDate,
      isLiving,
      relationshipType,
      notes,
      visibility,
      placeOfOrigin,
      existingPersonId,
      connectExistingUserId,
      connectUserEmail,
    });
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error in POST /api/family:', error);
    res.status(500).json({ error: error.message || 'Failed to add family member' });
  }
});

app.put('/api/family/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const relationshipId = parseInt(req.params.id, 10);
    const result = await updateFamilyRelationship(req.dbUser!.id, relationshipId, req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Error in PUT /api/family/:id:', error);
    res.status(500).json({ error: error.message || 'Failed to update relationship' });
  }
});

app.delete('/api/family/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const relationshipId = parseInt(req.params.id, 10);
    const result = await removeRelationship(req.dbUser!.id, relationshipId);
    res.json(result);
  } catch (error: any) {
    console.error('Error in DELETE /api/family/:id:', error);
    res.status(500).json({ error: error.message || 'Failed to remove relationship' });
  }
});

// Family Invitations
app.get('/api/family/invitation-notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state = await getFamilyInvitationNotificationState(
      req.dbUser!.id,
      req.user?.email_verified === true ? req.user.email : null,
    );
    res.json(state);
  } catch (error) {
    console.error('Error in GET /api/family/invitation-notifications:', error);
    res.status(500).json({ error: 'Failed to load invitation notifications' });
  }
});

app.post('/api/family/invitation-notifications/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await markFamilyInvitationActivityRead(req.dbUser!.id);
    const state = await getFamilyInvitationNotificationState(
      req.dbUser!.id,
      req.user?.email_verified === true ? req.user.email : null,
    );
    res.json(state);
  } catch (error) {
    console.error('Error in POST /api/family/invitation-notifications/read:', error);
    res.status(500).json({ error: 'Failed to clear invitation activity' });
  }
});

app.patch('/api/family/invitation-notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { alertsEnabled } = req.body;
    if (typeof alertsEnabled !== 'boolean') {
      return res.status(400).json({ error: 'alertsEnabled must be a boolean' });
    }
    await setFamilyInvitationAlertsEnabled(req.dbUser!.id, alertsEnabled);
    const state = await getFamilyInvitationNotificationState(
      req.dbUser!.id,
      req.user?.email_verified === true ? req.user.email : null,
    );
    res.json(state);
  } catch (error) {
    console.error('Error in PATCH /api/family/invitation-notifications:', error);
    res.status(500).json({ error: 'Failed to update invitation alerts' });
  }
});

app.get('/api/family/invitations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const invitations = await getFamilyInvitations(req.dbUser!.id);
    res.json(invitations);
  } catch (error: any) {
    console.error('Error in GET /api/family/invitations:', error);
    res.status(500).json({ error: 'Failed to load family invitations' });
  }
});

app.post('/api/family/invitations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { personId, inviteeEmail, relationshipType } = req.body;
    if (!Number.isInteger(Number(personId)) || Number(personId) <= 0 || typeof inviteeEmail !== 'string' || !relationshipType) {
      return res.status(400).json({ error: 'A valid person ID, verified recipient email, and relationship type are required' });
    }
    const invitation = await createFamilyInvitation(req.dbUser!.id, {
      personId: Number(personId),
      inviteeEmail,
      relationshipType,
    });
    res.status(201).json(invitation);
  } catch (error: any) {
    console.error('Error in POST /api/family/invitations:', error);
    res.status(500).json({ error: error.message || 'Failed to create invitation' });
  }
});

app.post('/api/family/invitations/accept', invitationRateLimit, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }
    const result = await acceptFamilyInvitation(
      req.dbUser!.id,
      inviteCode,
      req.user?.email_verified === true ? req.user.email : null
    );
    res.json(result);
  } catch (error: any) {
    console.error('Error in POST /api/family/invitations/accept:', error);
    res.status(400).json({ error: error.message || 'Failed to accept invitation' });
  }
});

app.post('/api/family/connect-user', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { personId, targetEmailOrCode } = req.body;
    if (!personId || !targetEmailOrCode) {
      return res.status(400).json({ error: 'Person ID and registered email or code are required' });
    }
    const result = await connectRegisteredUserToPerson(req.dbUser!.id, {
      personId: Number(personId),
      targetEmailOrCode,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error in POST /api/family/connect-user:', error);
    res.status(400).json({ error: error.message || 'Failed to connect user' });
  }
});

// Kinship Discovery (e.g. Samson Ossai discovering Williams Ossai's network)
app.get('/api/family/discovery', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.email_verified !== true || !req.user.email) {
      return res.status(403).json({ error: 'A verified email address is required to view invitations.' });
    }
    const matches = await getKinshipDiscoverySuggestions(req.dbUser!.id, req.user.email);
    res.json(matches);
  } catch (error: any) {
    console.error('Error in GET /api/family/discovery:', error);
    res.status(500).json({ error: 'Failed to discover family connections' });
  }
});

app.post('/api/family/claim', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { invitationId } = req.body;
    if (!Number.isInteger(Number(invitationId)) || Number(invitationId) <= 0) {
      return res.status(400).json({ error: 'A valid invitation is required' });
    }
    const result = await claimDiscoveredPerson(
      req.dbUser!.id,
      Number(invitationId),
      req.user?.email_verified === true ? req.user.email : null
    );
    res.json(result);
  } catch (error: any) {
    console.error('Error in POST /api/family/claim:', error);
    res.status(400).json({ error: error.message || 'Failed to claim family record' });
  }
});

// 7. Data Control: Export & Deletion
app.get('/api/user/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const exportData = await exportUserData(req.dbUser!.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=geosmart-data-${req.dbUser!.id}.json`);
    res.json(exportData);
  } catch (error: any) {
    console.error('Error in /api/user/export:', error);
    res.status(500).json({ error: 'Failed to export personal data' });
  }
});

app.delete('/api/user/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await deleteUserAccount(req.dbUser!.id);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/user/account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// 8. Test / Demo Scenario Seeding
app.post('/api/demo/seed', requireAuth, async (req: AuthRequest, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { scenario } = req.body;
    if (!['local', 'diaspora', 'international', 'multigen'].includes(scenario)) {
      return res.status(400).json({ error: 'Invalid scenario type' });
    }
    const result = await seedDemoScenario(req.dbUser!.id, scenario);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/demo/seed:', error);
    res.status(500).json({ error: 'Failed to load test scenario' });
  }
});

// --- Protected Administrator Endpoints ---

// Admin Platform Overview
app.get('/api/admin/metrics', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const reason = (req.query.reason as string) || 'Standard operational review';
    const metrics = await getAdminMetrics(req.dbUser!.id, reason);
    res.json(metrics);
  } catch (error: any) {
    console.error('Error in /api/admin/metrics:', error);
    res.status(500).json({ error: 'Failed to load platform metrics' });
  }
});

// Admin System Health
app.get('/api/admin/health', requireAdmin, async (req: AuthRequest, res) => {
  try {
    if (await shouldUseMockDatabase()) {
      return res.json({
        database: 'healthy',
        dbLatencyMs: 0,
        authService: 'healthy',
        serverUptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        recentErrorCount: null,
        timestamp: new Date().toISOString(),
      });
    }
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - t0;

    res.json({
      database: 'healthy',
      dbLatencyMs,
      authService: 'healthy',
      serverUptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      recentErrorCount: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      database: 'degraded',
      error: 'Health probe failed',
    });
  }
});

// Admin Activity Stream
app.get('/api/admin/activity', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 30;
    const events = await getAdminRecentActivity(limit);
    res.json(events);
  } catch (error: any) {
    console.error('Error in /api/admin/activity:', error);
    res.status(500).json({ error: 'Failed to load activity stream' });
  }
});

// Admin User Management
app.get('/api/admin/users', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
    const usersList = await getAdminUsersList(q);
    res.json(usersList);
  } catch (error: any) {
    console.error('Error in /api/admin/users:', error);
    res.status(500).json({ error: 'Failed to load user list' });
  }
});

// Admin Update User Status (Suspend / Reactivate)
app.patch('/api/admin/users/:id/status', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { status, reason } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Administrative operational reason is mandatory' });
    }
    const result = await adminUpdateUserStatus(req.dbUser!.id, targetUserId, status, reason);
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/admin/users/:id/status:', error);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

// Admin Access Logs
app.get('/api/admin/logs', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const logs = await getAdminLogs(50);
    res.json(logs);
  } catch (error: any) {
    console.error('Error in /api/admin/logs:', error);
    res.status(500).json({ error: 'Failed to load access logs' });
  }
});

// Vite Middleware Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GeoSmart server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
