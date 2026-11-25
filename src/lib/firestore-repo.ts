import type { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase.ts';
import type {
  AdminAccessLogEntry,
  CommunityConnectionType,
  CommunityType,
  CommunityWithConnection,
  FamilyGroup,
  FamilyGroupComment,
  FamilyGroupInvitationSummary,
  FamilyGroupMember,
  FamilyGroupPost,
  FamilyInvitationRecord,
  FamilyMemberWithPerson,
  FamilyStorySummary,
  FamilyTreeGraph,
  FamilyTreeNode,
  GeoSmartOverview,
  KinshipDiscoveryMatch,
  PlaceConnectionType,
  PlaceWithConnection,
  RelationshipType,
  VisibilitySetting,
} from '../types.ts';

const BOOTSTRAP_ADMIN_EMAIL = 'alphaonesolutionsltd@gmail.com';
const SUPPORTED_GENDERS = new Set(['female', 'male', 'non_binary', 'another', 'unspecified']);
const SUPPORTED_VISIBILITIES = new Set<VisibilitySetting>(['private', 'shared', 'public']);
const SUPPORTED_RELATIONSHIPS = new Set<RelationshipType>([
  'parent',
  'child',
  'spouse',
  'sibling',
  'grandparent',
  'grandchild',
  'relative',
  'other',
]);

function toNumericId(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = (hash >>> 0) % 2000000000;
  return positive >= 1 ? positive : 1;
}

function clamp(val: string | null | undefined, max: number): string {
  return (val || '').trim().slice(0, max);
}

function safeVisibility(val?: string | null): VisibilitySetting {
  if (val && SUPPORTED_VISIBILITIES.has(val as VisibilitySetting)) {
    return val as VisibilitySetting;
  }
  return 'private';
}

function safeGender(val?: string | null): string {
  if (val && SUPPORTED_GENDERS.has(val)) return val;
  return 'unspecified';
}

function safeRelationship(val?: string | null): RelationshipType {
  if (val && SUPPORTED_RELATIONSHIPS.has(val as RelationshipType)) {
    return val as RelationshipType;
  }
  return 'other';
}

function generateSafeId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function tsToIso(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function tsToMs(value: unknown): number {
  return new Date(tsToIso(value)).getTime();
}

export function getInverseRelationship(type: RelationshipType): RelationshipType {
  switch (type) {
    case 'parent':
      return 'child';
    case 'child':
      return 'parent';
    case 'spouse':
      return 'spouse';
    case 'sibling':
      return 'sibling';
    case 'grandparent':
      return 'grandchild';
    case 'grandchild':
      return 'grandparent';
    case 'relative':
      return 'relative';
    default:
      return 'other';
  }
}

function requireVerifiedCurrentUser(): User {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to continue.');
  }
  if (!user.emailVerified) {
    throw new Error('Verify your email address before saving or modifying records.');
  }
  return user;
}

function isBootstrapAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL,
  );
}

interface UserAccountDoc {
  uid: string;
  numericId: number;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: string;
  isLiving: boolean;
  bio: string;
  currentResidenceSummary: string;
  originSummary: string;
  visibility: VisibilitySetting;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  onboardingCompleted: boolean;
  alertsEnabled: boolean;
  activityReadAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface PlaceDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  name: string;
  country: string;
  stateRegion: string;
  districtLga: string;
  townCity: string;
  villageLocality: string;
  placeType: string;
  connectionType: PlaceConnectionType;
  humanLabel: string;
  isCurrent: boolean;
  notes: string;
  visibility: VisibilitySetting;
  createdAt: unknown;
  updatedAt: unknown;
}

interface CommunityDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  name: string;
  communityType: CommunityType;
  description: string;
  associatedPlaceName: string;
  associatedPlaceCountry: string;
  connectionType: CommunityConnectionType;
  humanLabel: string;
  notes: string;
  visibility: 'private';
  createdAt: unknown;
  updatedAt: unknown;
}

interface FamilyMemberDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  linkedUid: string;
  pendingInviteId: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: string;
  isLiving: boolean;
  birthDate?: string;
  deathDate?: string;
  relationshipType: RelationshipType;
  inverseRelationshipType: RelationshipType;
  notes: string;
  visibility: VisibilitySetting;
  originPlaceName: string;
  originPlaceCountry: string;
  createdAt: unknown;
  updatedAt: unknown;
}

interface ActivityEventDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  eventType: string;
  summary: string;
  targetType: string;
  scope: string;
  previousVisibility: string;
  selectedVisibility: string;
  createdAt: unknown;
}

interface SharedProfileDoc {
  uid: string;
  numericId: number;
  displayName: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: string;
  originSummary: string;
  currentResidenceSummary: string;
  placeOfOriginName: string;
  placeOfOriginCountry: string;
  sharedPlacesCount: number;
  visibility: VisibilitySetting;
  updatedAt: unknown;
}

interface FamilyInvitationDoc {
  id: string;
  numericId: number;
  inviterUid: string;
  inviterName: string;
  inviterFirstName: string;
  inviterLastName: string;
  inviterGender: string;
  memberId: string;
  memberNumericId: number;
  personName: string;
  inviteeEmail: string;
  inviteCodeHash: string;
  relationshipType: RelationshipType;
  gender: string;
  inviterFamilyCount: number;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedByUid: string;
  expiresAt: unknown;
  acceptedAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface StoryDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  mediaType: 'audio' | 'video';
  contentType: string;
  fileSize: number;
  storagePath?: string;
  visibility: 'private' | 'family';
  createdAt: unknown;
}

interface SharedFamilyStoryDoc {
  id: string;
  numericId: number;
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  mediaType: 'audio' | 'video';
  contentType: string;
  fileSize: number;
  storagePath: string;
  visibility: 'family';
  allowedUids: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

interface FamilyGroupDoc {
  id: string;
  numericId: number;
  name: string;
  description: string;
  organizerUid: string;
  organizerName: string;
  memberUids: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

interface FamilyGroupMemberDoc {
  uid: string;
  numericId: number;
  groupId: string;
  name: string;
  personNumericId: number;
  relationshipType: string;
  isOrganizer: boolean;
  joinedAt: unknown;
}

interface FamilyGroupInvitationDoc {
  id: string;
  numericId: number;
  groupId: string;
  groupName: string;
  groupDescription: string;
  inviterUid: string;
  inviterName: string;
  inviteeUid: string;
  inviteeName: string;
  personNumericId: number;
  relationshipType: RelationshipType;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  expiresAt: unknown;
  acceptedAt?: unknown;
  invitedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface FamilyGroupPostDoc {
  id: string;
  numericId: number;
  groupId: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: unknown;
}

interface FamilyGroupCommentDoc {
  id: string;
  numericId: number;
  groupId: string;
  postId: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: unknown;
}

interface AdminLogDoc {
  id: string;
  numericId: number;
  adminUid: string;
  adminNumericId: number;
  adminEmail: string;
  action: string;
  targetUid: string;
  targetNumericId: number;
  targetAccountCode: string;
  reason: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  timestamp: unknown;
}

async function recordActivityEventFs(
  uid: string,
  eventType: string,
  summary: string,
  targetType = '',
  privacyMeta?: { scope: string; previous: VisibilitySetting; selected: VisibilitySetting },
): Promise<void> {
  const eventId = generateSafeId('evt');
  const path = `users/${uid}/activityEvents/${eventId}`;
  const payload = {
    id: eventId,
    numericId: toNumericId(eventId),
    ownerUid: uid,
    eventType: clamp(eventType, 64) || 'ACTIVITY',
    summary: clamp(summary, 250) || 'Account updated',
    targetType: clamp(targetType, 40),
    scope: clamp(privacyMeta?.scope, 48),
    previousVisibility: clamp(privacyMeta?.previous, 16),
    selectedVisibility: clamp(privacyMeta?.selected, 16),
    createdAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'activityEvents', eventId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function listOwnerSubcollection<T>(uid: string, subcollectionName: string): Promise<T[]> {
  const path = `users/${uid}/${subcollectionName}`;
  try {
    const q = query(
      collection(db, 'users', uid, subcollectionName),
      where('ownerUid', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

async function syncSharedProfileFs(uid: string): Promise<void> {
  const userPath = `users/${uid}`;
  const sharedPath = `sharedProfiles/${uid}`;
  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
  if (!userSnap.exists()) return;
  const user = userSnap.data() as UserAccountDoc;

  if (user.visibility === 'private') {
    try {
      const existingShared = await getDoc(doc(db, 'sharedProfiles', uid));
      if (existingShared.exists()) {
        await deleteDoc(doc(db, 'sharedProfiles', uid));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, sharedPath);
    }
    return;
  }

  const places = await listOwnerSubcollection<PlaceDoc>(uid, 'places');
  const sharedPlaces = places.filter((p) => p.visibility === 'shared' || p.visibility === 'public');
  const originPlace = sharedPlaces.find(
    (p) => p.connectionType === 'origin' || p.connectionType === 'birthplace' || p.connectionType === 'residence',
  );

  const sharedPayload = {
    uid: user.uid,
    numericId: user.numericId,
    displayName: clamp(user.displayName, 120),
    firstName: clamp(user.firstName, 80) || 'Member',
    lastName: clamp(user.lastName, 80),
    otherNames: clamp(user.otherNames, 120),
    gender: safeGender(user.gender),
    originSummary: clamp(user.originSummary, 200),
    currentResidenceSummary: clamp(user.currentResidenceSummary, 200),
    placeOfOriginName: clamp(originPlace?.name, 120),
    placeOfOriginCountry: clamp(originPlace?.country, 100),
    sharedPlacesCount: Math.min(sharedPlaces.length, 500),
    visibility: user.visibility,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'sharedProfiles', uid), sharedPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, sharedPath);
  }
}

export async function ensureUserDocumentFs(fbUser: User): Promise<UserAccountDoc> {
  const uid = fbUser.uid;
  const path = `users/${uid}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const isBootstrap = isBootstrapAdminUser(fbUser);

  if (snap.exists()) {
    const existing = snap.data() as UserAccountDoc;
    if (isBootstrap && existing.role !== 'admin') {
      try {
        await updateDoc(doc(db, 'users', uid), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        });
        return { ...existing, role: 'admin' };
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
    if (!isBootstrap && existing.role === 'admin') {
      let hasExplicitAdminDoc = false;
      try {
        const adminSnap = await getDoc(doc(db, 'admins', uid));
        hasExplicitAdminDoc = adminSnap.exists();
      } catch {
        hasExplicitAdminDoc = false;
      }
      if (!hasExplicitAdminDoc) {
        try {
          await updateDoc(doc(db, 'users', uid), {
            role: 'user',
            updatedAt: serverTimestamp(),
          });
          return { ...existing, role: 'user' };
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }
    return existing;
  }

  const emailLower = (fbUser.email || '').trim().toLowerCase();
  const baseName = (fbUser.displayName || emailLower.split('@')[0] || 'Member').trim();
  const parts = baseName.split(/\s+/).filter(Boolean);
  const firstName = clamp(parts[0] || 'User', 80);
  const lastName = clamp(parts.length > 1 ? parts.slice(1).join(' ') : 'Member', 80);
  const displayName = clamp(fbUser.displayName || `${firstName} ${lastName}`.trim(), 120);

  const newUserDoc = {
    uid,
    numericId: toNumericId(uid),
    email: clamp(emailLower, 254),
    displayName,
    firstName,
    lastName,
    otherNames: '',
    gender: 'unspecified',
    isLiving: true,
    bio: '',
    currentResidenceSummary: '',
    originSummary: '',
    visibility: 'private' as VisibilitySetting,
    role: (isBootstrap ? 'admin' : 'user') as 'user' | 'admin',
    status: 'active' as const,
    onboardingCompleted: false,
    alertsEnabled: true,
    activityReadAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), newUserDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(uid, 'USER_CREATED', `Account created for ${emailLower}`, 'user');

  try {
    const created = await getDoc(doc(db, 'users', uid));
    return created.data() as UserAccountDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getUserOverviewFs(uid: string): Promise<GeoSmartOverview> {
  const userPath = `users/${uid}`;
  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let userData: UserAccountDoc;
  if (!userSnap.exists()) {
    const fbUser = auth.currentUser;
    if (!fbUser || fbUser.uid !== uid) {
      throw new Error('User account record could not be found.');
    }
    userData = await ensureUserDocumentFs(fbUser);
  } else {
    userData = userSnap.data() as UserAccountDoc;
  }

  const [places, communities, familyMembers, activityEvents] = await Promise.all([
    listOwnerSubcollection<PlaceDoc>(uid, 'places'),
    listOwnerSubcollection<CommunityDoc>(uid, 'communities'),
    listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers'),
    listOwnerSubcollection<ActivityEventDoc>(uid, 'activityEvents'),
  ]);

  const sortedEvents = [...activityEvents].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  const recentActivity = sortedEvents.slice(0, 5).map((ev) => ({
    id: ev.numericId,
    summary: ev.summary,
    createdAt: tsToIso(ev.createdAt),
  }));

  const privacyHistory = sortedEvents
    .filter(
      (ev) =>
        ev.eventType === 'PROFILE_SHARING_PREFERENCE_UPDATED' ||
        ev.eventType === 'PLACE_SHARING_PREFERENCE_UPDATED',
    )
    .slice(0, 5)
    .map((ev) => ({
      id: ev.numericId,
      previous: safeVisibility(ev.previousVisibility),
      selected: safeVisibility(ev.selectedVisibility),
      scope: (ev.scope === 'place_connection' ? 'Place' : 'Profile') as 'Profile' | 'Place',
      createdAt: tsToIso(ev.createdAt),
    }));

  const distinctCountries = new Set(places.map((p) => p.country.trim().toLowerCase()).filter(Boolean)).size;

  return {
    user: {
      id: userData.numericId,
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName || null,
      role: userData.role,
      status: userData.status,
      onboardingCompleted: userData.onboardingCompleted,
      createdAt: tsToIso(userData.createdAt),
    },
    person: {
      id: userData.numericId,
      userId: userData.numericId,
      firstName: userData.firstName,
      lastName: userData.lastName,
      otherNames: userData.otherNames || null,
      gender: userData.gender === 'unspecified' ? null : userData.gender,
      birthDate: null,
      isLiving: userData.isLiving,
      createdByUserId: userData.numericId,
    },
    profile: {
      id: userData.numericId,
      personId: userData.numericId,
      bio: userData.bio || null,
      currentResidenceSummary: userData.currentResidenceSummary || null,
      originSummary: userData.originSummary || null,
      avatarUrl: null,
      visibility: userData.visibility,
    },
    stats: {
      countriesCount: distinctCountries,
      placesCount: places.length,
      communitiesCount: communities.length,
      familyCount: familyMembers.length,
    },
    recentActivity,
    privacyHistory,
  };
}

export async function updateUserProfileFs(
  uid: string,
  data: {
    firstName?: string;
    lastName?: string;
    otherNames?: string | null;
    bio?: string | null;
    currentResidenceSummary?: string | null;
    originSummary?: string | null;
    visibility?: VisibilitySetting;
  },
): Promise<void> {
  requireVerifiedCurrentUser();
  const path = `users/${uid}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) throw new Error('Account profile not found.');
  const current = snap.data() as UserAccountDoc;

  const firstName = data.firstName !== undefined ? clamp(data.firstName, 80) || current.firstName : current.firstName;
  const lastName = data.lastName !== undefined ? clamp(data.lastName, 80) : current.lastName;
  const displayName = clamp(`${firstName} ${lastName}`.trim(), 120) || current.displayName;
  const nextVisibility = data.visibility !== undefined ? safeVisibility(data.visibility) : current.visibility;

  const updates = {
    firstName,
    lastName,
    displayName,
    otherNames: data.otherNames !== undefined ? clamp(data.otherNames, 120) : current.otherNames,
    bio: data.bio !== undefined ? clamp(data.bio, 1500) : current.bio,
    currentResidenceSummary:
      data.currentResidenceSummary !== undefined
        ? clamp(data.currentResidenceSummary, 200)
        : current.currentResidenceSummary,
    originSummary:
      data.originSummary !== undefined ? clamp(data.originSummary, 200) : current.originSummary,
    visibility: nextVisibility,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'users', uid), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await syncSharedProfileFs(uid);
  await recordActivityEventFs(uid, 'PROFILE_UPDATED', 'Personal profile information updated', 'profile');

  if (data.visibility && data.visibility !== current.visibility) {
    await recordActivityEventFs(
      uid,
      'PROFILE_SHARING_PREFERENCE_UPDATED',
      'Profile sharing preference changed',
      'profile',
      {
        scope: 'profile_details_through_family_connections',
        previous: current.visibility,
        selected: nextVisibility,
      },
    );
  }
}

export async function completeOnboardingFs(uid: string): Promise<void> {
  requireVerifiedCurrentUser();
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      onboardingCompleted: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await recordActivityEventFs(uid, 'ONBOARDING_COMPLETED', 'User completed initial onboarding tour', 'user');
}

function defaultPlaceHumanLabel(connectionType: PlaceConnectionType): string {
  switch (connectionType) {
    case 'residence':
      return 'Where I live';
    case 'origin':
      return "Where I'm from";
    case 'family_ancestral':
      return 'Family/ancestral place';
    case 'birthplace':
      return 'Birthplace';
    case 'work':
      return 'Work location';
    case 'study':
      return 'Study location';
    default:
      return 'Connected place';
  }
}

export async function getUserPlacesFs(uid: string): Promise<PlaceWithConnection[]> {
  const docs = await listOwnerSubcollection<PlaceDoc>(uid, 'places');
  const sorted = [...docs].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return sorted.map((p) => ({
    id: p.numericId,
    connectionId: p.numericId,
    name: p.name,
    country: p.country,
    stateRegion: p.stateRegion || null,
    districtLga: p.districtLga || null,
    townCity: p.townCity || null,
    villageLocality: p.villageLocality || null,
    placeType: p.placeType || 'geographic_place',
    connectionType: p.connectionType,
    humanLabel: p.humanLabel || null,
    isCurrent: p.isCurrent,
    notes: p.notes || null,
    visibility: p.visibility,
  }));
}

export async function addPlaceConnectionFs(
  uid: string,
  data: {
    name: string;
    country: string;
    stateRegion?: string | null;
    districtLga?: string | null;
    townCity?: string | null;
    villageLocality?: string | null;
    placeType?: string;
    connectionType: PlaceConnectionType;
    humanLabel?: string | null;
    isCurrent?: boolean;
    notes?: string | null;
    visibility?: VisibilitySetting;
  },
): Promise<void> {
  requireVerifiedCurrentUser();
  const cleanName = clamp(data.name, 120);
  const cleanCountry = clamp(data.country, 100);
  if (!cleanName || !cleanCountry) {
    throw new Error('Place name and country are required.');
  }

  const existingPlaces = await listOwnerSubcollection<PlaceDoc>(uid, 'places');
  const duplicate = existingPlaces.find(
    (p) =>
      p.name.trim().toLowerCase() === cleanName.toLowerCase() &&
      p.country.trim().toLowerCase() === cleanCountry.toLowerCase() &&
      p.connectionType === data.connectionType,
  );
  if (duplicate) return;

  const placeId = generateSafeId('plc');
  const humanLabel = clamp(data.humanLabel, 120) || defaultPlaceHumanLabel(data.connectionType);
  const path = `users/${uid}/places/${placeId}`;

  const payload = {
    id: placeId,
    numericId: toNumericId(placeId),
    ownerUid: uid,
    name: cleanName,
    country: cleanCountry,
    stateRegion: clamp(data.stateRegion, 120),
    districtLga: clamp(data.districtLga, 120),
    townCity: clamp(data.townCity, 120),
    villageLocality: clamp(data.villageLocality, 120),
    placeType: clamp(data.placeType || 'geographic_place', 40) || 'geographic_place',
    connectionType: data.connectionType,
    humanLabel,
    isCurrent: Boolean(data.isCurrent),
    notes: clamp(data.notes, 600),
    visibility: safeVisibility(data.visibility),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'places', placeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await syncSharedProfileFs(uid);
  await recordActivityEventFs(uid, 'PLACE_ADDED', `Added place connection: ${cleanName}, ${cleanCountry} (${humanLabel})`, 'place');
}

export async function updatePlaceConnectionFs(
  uid: string,
  connectionId: number,
  data: {
    name: string;
    country: string;
    stateRegion?: string | null;
    districtLga?: string | null;
    townCity?: string | null;
    villageLocality?: string | null;
    placeType?: string;
    connectionType: PlaceConnectionType;
    humanLabel?: string | null;
    isCurrent?: boolean;
    notes?: string | null;
    visibility?: VisibilitySetting;
  },
): Promise<void> {
  requireVerifiedCurrentUser();
  const places = await listOwnerSubcollection<PlaceDoc>(uid, 'places');
  const existing = places.find((p) => p.numericId === connectionId);
  if (!existing) throw new Error('Place connection not found.');

  const cleanName = clamp(data.name, 120) || existing.name;
  const cleanCountry = clamp(data.country, 100) || existing.country;
  const nextVisibility = safeVisibility(data.visibility ?? existing.visibility);
  const path = `users/${uid}/places/${existing.id}`;

  try {
    await updateDoc(doc(db, 'users', uid, 'places', existing.id), {
      name: cleanName,
      country: cleanCountry,
      stateRegion: clamp(data.stateRegion, 120),
      districtLga: clamp(data.districtLga, 120),
      townCity: clamp(data.townCity, 120),
      villageLocality: clamp(data.villageLocality, 120),
      placeType: clamp(data.placeType || existing.placeType || 'geographic_place', 40),
      connectionType: data.connectionType,
      humanLabel: clamp(data.humanLabel, 120),
      isCurrent: Boolean(data.isCurrent),
      notes: clamp(data.notes, 600),
      visibility: nextVisibility,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await syncSharedProfileFs(uid);
  if (data.visibility && data.visibility !== existing.visibility) {
    await recordActivityEventFs(uid, 'PLACE_SHARING_PREFERENCE_UPDATED', 'Place sharing preference changed', 'place_connection', {
      scope: 'place_connection',
      previous: existing.visibility,
      selected: nextVisibility,
    });
  }
  await recordActivityEventFs(uid, 'PLACE_UPDATED', `Updated place connection: ${cleanName}, ${cleanCountry}`, 'place');
}

export async function removePlaceConnectionFs(uid: string, connectionId: number): Promise<void> {
  requireVerifiedCurrentUser();
  const places = await listOwnerSubcollection<PlaceDoc>(uid, 'places');
  const target = places.find((p) => p.numericId === connectionId);
  if (!target) throw new Error('Place connection not found.');

  const path = `users/${uid}/places/${target.id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'places', target.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await syncSharedProfileFs(uid);
  await recordActivityEventFs(uid, 'PLACE_REMOVED', 'Removed place connection', 'place');
}

function defaultCommunityLabel(connectionType: CommunityConnectionType | string): string {
  switch (connectionType) {
    case 'resident':
      return 'Resident';
    case 'member':
      return 'Member';
    case 'origin':
      return 'Community of Origin';
    case 'ancestral':
    case 'ancestral_connection':
      return 'Ancestral Connection';
    case 'family':
    case 'family_connection':
      return 'Family Connection';
    case 'marriage':
    case 'marriage_connection':
      return 'Marriage Connection';
    case 'professional':
      return 'Professional Association';
    default:
      return 'Community Connection';
  }
}

export async function getUserCommunitiesFs(uid: string): Promise<CommunityWithConnection[]> {
  const docs = await listOwnerSubcollection<CommunityDoc>(uid, 'communities');
  const sorted = [...docs].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return sorted.map((c) => ({
    id: c.numericId,
    connectionId: c.numericId,
    name: c.name,
    communityType: c.communityType,
    description: c.description || null,
    associatedPlaceId: null,
    associatedPlaceName: c.associatedPlaceName || null,
    associatedPlaceCountry: c.associatedPlaceCountry || null,
    connectionType: c.connectionType,
    humanLabel: c.humanLabel || null,
    notes: c.notes || null,
    visibility: 'private',
  }));
}

export async function addCommunityConnectionFs(
  uid: string,
  data: {
    name: string;
    communityType?: CommunityType | string;
    description?: string | null;
    connectionType: CommunityConnectionType | string;
    humanLabel?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  requireVerifiedCurrentUser();
  const cleanName = clamp(data.name, 140);
  if (!cleanName) throw new Error('Community name is required.');

  const existingCommunities = await listOwnerSubcollection<CommunityDoc>(uid, 'communities');
  const duplicate = existingCommunities.find(
    (c) =>
      c.name.trim().toLowerCase() === cleanName.toLowerCase() &&
      c.connectionType === data.connectionType,
  );
  if (duplicate) return;

  const communityId = generateSafeId('com');
  const humanLabel = clamp(data.humanLabel, 120) || defaultCommunityLabel(data.connectionType);
  const path = `users/${uid}/communities/${communityId}`;

  const payload = {
    id: communityId,
    numericId: toNumericId(communityId),
    ownerUid: uid,
    name: cleanName,
    communityType: (data.communityType || 'hometown') as CommunityType,
    description: clamp(data.description, 600),
    associatedPlaceName: '',
    associatedPlaceCountry: '',
    connectionType: (data.connectionType || 'member') as CommunityConnectionType,
    humanLabel,
    notes: clamp(data.notes, 600),
    visibility: 'private' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'communities', communityId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(uid, 'COMMUNITY_ADDED', `Connected to community: ${cleanName} (${humanLabel})`, 'community');
}

export async function removeCommunityConnectionFs(uid: string, connectionId: number): Promise<void> {
  requireVerifiedCurrentUser();
  const docs = await listOwnerSubcollection<CommunityDoc>(uid, 'communities');
  const target = docs.find((c) => c.numericId === connectionId);
  if (!target) throw new Error('Community connection not found.');

  const path = `users/${uid}/communities/${target.id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'communities', target.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await recordActivityEventFs(uid, 'COMMUNITY_REMOVED', 'Removed community connection', 'community');
}

export async function getUserFamilyFs(uid: string): Promise<FamilyMemberWithPerson[]> {
  const memberDocs = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const sorted = [...memberDocs].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

  const seenLinkedUids = new Set<string>();
  const seenNameKeys = new Set<string>();
  const results: FamilyMemberWithPerson[] = [];

  for (const m of sorted) {
    if (m.linkedUid) {
      if (seenLinkedUids.has(m.linkedUid)) continue;
      seenLinkedUids.add(m.linkedUid);
    }
    const nameKey = `${m.firstName.trim().toLowerCase()}_${m.lastName.trim().toLowerCase()}_${m.relationshipType}`;
    if (seenNameKeys.has(nameKey)) continue;
    seenNameKeys.add(nameKey);

    let sharedProfile: SharedProfileDoc | null = null;
    if (m.linkedUid && m.linkedUid !== uid) {
      const spPath = `sharedProfiles/${m.linkedUid}`;
      try {
        const spSnap = await getDoc(doc(db, 'sharedProfiles', m.linkedUid));
        if (spSnap.exists()) {
          const spData = spSnap.data() as SharedProfileDoc;
          if (spData.visibility === 'shared' || spData.visibility === 'public') {
            sharedProfile = spData;
          }
        }
      } catch (error) {
        // Non-shared profiles with 'private' docs deny cross-user read cleanly
        const msg = error instanceof Error ? error.message.toLowerCase() : '';
        if (!msg.includes('permission') && !msg.includes('insufficient')) {
          handleFirestoreError(error, OperationType.GET, spPath);
        }
      }
    }

    const isLinkedAccount = Boolean(m.linkedUid);
    const canViewSharedDetails = isLinkedAccount ? Boolean(sharedProfile) : !m.isLiving;

    results.push({
      relationshipId: m.numericId,
      personId: m.numericId,
      firstName: sharedProfile?.firstName || m.firstName,
      lastName: sharedProfile?.lastName || m.lastName,
      otherNames: canViewSharedDetails ? sharedProfile?.otherNames || m.otherNames || null : null,
      relationshipType: m.relationshipType,
      inverseRelationshipType: m.inverseRelationshipType,
      notes: canViewSharedDetails ? m.notes || null : null,
      gender: canViewSharedDetails
        ? (sharedProfile?.gender && sharedProfile.gender !== 'unspecified'
            ? sharedProfile.gender
            : m.gender === 'unspecified'
            ? null
            : m.gender)
        : null,
      isLiving: m.isLiving,
      birthDate: canViewSharedDetails ? m.birthDate || null : null,
      deathDate: !m.isLiving ? m.deathDate || null : null,
      placesCount: sharedProfile
        ? sharedProfile.sharedPlacesCount
        : !isLinkedAccount && !m.isLiving && (m.originPlaceName || m.originPlaceCountry)
        ? 1
        : 0,
      userId: m.linkedUid ? toNumericId(m.linkedUid) : null,
      hasAccount: isLinkedAccount,
      userEmail: null,
      userDisplayName: sharedProfile?.displayName || null,
      visibility: sharedProfile?.visibility || m.visibility,
      placeOfOrigin: canViewSharedDetails
        ? sharedProfile?.placeOfOriginName
          ? { name: sharedProfile.placeOfOriginName, country: sharedProfile.placeOfOriginCountry }
          : (m.originPlaceName || m.originPlaceCountry)
          ? { name: m.originPlaceName, country: m.originPlaceCountry }
          : null
        : null,
      originSummary: canViewSharedDetails ? sharedProfile?.originSummary || null : null,
      currentResidenceSummary: canViewSharedDetails ? sharedProfile?.currentResidenceSummary || null : null,
    });
  }

  return results;
}

export async function getUserFamilyTreeFs(uid: string): Promise<FamilyTreeGraph> {
  const overview = await getUserOverviewFs(uid);
  const places = await getUserPlacesFs(uid);
  const selfOriginPlace = places.find((p) => p.connectionType === 'origin' || p.connectionType === 'birthplace');
  const selfOrigin = selfOriginPlace
    ? `${selfOriginPlace.name}, ${selfOriginPlace.country}`
    : overview.profile.originSummary || null;

  const selfNode: FamilyTreeNode = {
    personId: overview.person.id,
    firstName: overview.person.firstName,
    lastName: overview.person.lastName,
    otherNames: overview.person.otherNames,
    gender: overview.person.gender,
    relationshipType: 'self',
    generation: 0,
    generationLabel: 'You',
    isSelf: true,
    isLiving: overview.person.isLiving,
    hasAccount: true,
    userId: overview.user.id,
    userEmail: overview.user.email,
    userDisplayName: overview.user.displayName,
    notes: null,
    placeOfOrigin: selfOrigin,
    placesCount: places.length,
    visibility: overview.profile.visibility,
  };

  const familyMembers = await getUserFamilyFs(uid);
  const nodes: FamilyTreeNode[] = [selfNode];
  const generations: Record<number, FamilyTreeNode[]> = {
    2: [],
    1: [],
    0: [selfNode],
    [-1]: [],
    [-2]: [],
    3: [],
  };

  const placeMap = new Map<string, { name: string; country: string }>();
  if (selfOriginPlace) {
    placeMap.set(`${selfOriginPlace.name}-${selfOriginPlace.country}`, {
      name: selfOriginPlace.name,
      country: selfOriginPlace.country,
    });
  }

  let membersWithAccounts = 1;
  for (const member of familyMembers) {
    let generation = 3;
    let generationLabel = 'Extended Family';
    switch (member.relationshipType) {
      case 'grandparent':
        generation = 2;
        generationLabel = 'Grandparents';
        break;
      case 'parent':
        generation = 1;
        generationLabel = 'Parents';
        break;
      case 'spouse':
        generation = 0;
        generationLabel = 'Spouses & Partners';
        break;
      case 'sibling':
        generation = 0;
        generationLabel = 'Siblings';
        break;
      case 'child':
        generation = -1;
        generationLabel = 'Children';
        break;
      case 'grandchild':
        generation = -2;
        generationLabel = 'Grandchildren';
        break;
      default:
        generation = 3;
        generationLabel = 'Extended Family';
        break;
    }

    const placeStr = member.placeOfOrigin
      ? [member.placeOfOrigin.name, member.placeOfOrigin.country].filter(Boolean).join(', ')
      : member.originSummary || null;

    if (member.placeOfOrigin && member.placeOfOrigin.name) {
      placeMap.set(`${member.placeOfOrigin.name}-${member.placeOfOrigin.country}`, member.placeOfOrigin);
    }
    if (member.hasAccount) membersWithAccounts++;

    const node: FamilyTreeNode = {
      personId: member.personId,
      relationshipId: member.relationshipId,
      firstName: member.firstName,
      lastName: member.lastName,
      otherNames: member.otherNames,
      gender: member.gender,
      relationshipType: member.relationshipType,
      generation,
      generationLabel,
      isSelf: false,
      isLiving: member.isLiving,
      birthDate: member.birthDate || null,
      deathDate: member.deathDate || null,
      hasAccount: Boolean(member.hasAccount),
      userId: member.userId,
      userEmail: member.userEmail,
      userDisplayName: member.userDisplayName,
      notes: member.notes,
      placeOfOrigin: placeStr,
      placesCount: member.placesCount,
      visibility: member.visibility,
    };

    nodes.push(node);
    if (!generations[generation]) generations[generation] = [];
    generations[generation].push(node);
  }

  const generationsWithMembers = Object.entries(generations).filter(([, list]) => list.length > 0);
  return {
    self: selfNode,
    nodes,
    generations,
    summary: {
      totalMembers: nodes.length,
      generationsCount: generationsWithMembers.length,
      membersWithAccounts,
      placesCount: placeMap.size,
      placesList: Array.from(placeMap.values()),
    },
  };
}

export async function addFamilyMemberFs(
  uid: string,
  data: {
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    gender?: string | null;
    isLiving?: boolean;
    birthDate?: string | null;
    deathDate?: string | null;
    relationshipType: RelationshipType;
    notes?: string | null;
    visibility?: VisibilitySetting;
    originPlace?: { name?: string | null; country?: string | null };
  },
): Promise<{ alreadyConnected?: boolean }> {
  requireVerifiedCurrentUser();
  const firstName = clamp(data.firstName, 80);
  const lastName = clamp(data.lastName, 80);
  if (!firstName || !lastName) {
    throw new Error('First name and last name are required.');
  }
  const relType = safeRelationship(data.relationshipType);
  const isLiving = data.isLiving !== undefined ? Boolean(data.isLiving) : true;
  const existing = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');

  const duplicate = existing.find(
    (m) =>
      m.firstName.trim().toLowerCase() === firstName.toLowerCase() &&
      m.lastName.trim().toLowerCase() === lastName.toLowerCase() &&
      m.relationshipType === relType,
  );
  if (duplicate) return { alreadyConnected: true };

  const memberId = generateSafeId('mem');
  const path = `users/${uid}/familyMembers/${memberId}`;
  const allowDetails = !isLiving;

  const payload = {
    id: memberId,
    numericId: toNumericId(memberId),
    ownerUid: uid,
    linkedUid: '',
    pendingInviteId: '',
    firstName,
    lastName,
    otherNames: allowDetails ? clamp(data.otherNames, 120) : '',
    gender: safeGender(data.gender),
    isLiving,
    birthDate: allowDetails ? clamp(data.birthDate, 32) : '',
    deathDate: allowDetails ? clamp(data.deathDate, 32) : '',
    relationshipType: relType,
    inverseRelationshipType: getInverseRelationship(relType),
    notes: allowDetails ? clamp(data.notes, 600) : '',
    visibility: safeVisibility(data.visibility),
    originPlaceName: allowDetails ? clamp(data.originPlace?.name, 120) : '',
    originPlaceCountry: allowDetails ? clamp(data.originPlace?.country, 100) : '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'familyMembers', memberId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(
    uid,
    'FAMILY_MEMBER_ADDED',
    `Added ${isLiving ? '' : 'late '}family connection: ${firstName} ${lastName} (${relType})`,
    'person',
  );
  return {};
}

export async function updateFamilyRelationshipFs(
  uid: string,
  relationshipIdOrPersonId: number,
  data: {
    firstName?: string;
    lastName?: string;
    otherNames?: string | null;
    gender?: string | null;
    isLiving?: boolean;
    birthDate?: string | null;
    deathDate?: string | null;
    relationshipType?: RelationshipType;
    notes?: string | null;
    originPlace?: { name?: string | null; country?: string | null } | null;
  },
): Promise<void> {
  requireVerifiedCurrentUser();
  const existing = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const target = existing.find((m) => m.numericId === relationshipIdOrPersonId);
  if (!target) throw new Error('Relationship not found.');

  if (target.linkedUid) {
    if (
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.otherNames !== undefined ||
      data.gender !== undefined ||
      data.isLiving !== undefined ||
      data.birthDate !== undefined ||
      data.deathDate !== undefined ||
      data.originPlace !== undefined
    ) {
      throw new Error('Only an unclaimed family profile you created can have those details edited here.');
    }
  }

  const nextIsLiving = data.isLiving !== undefined ? Boolean(data.isLiving) : target.isLiving;
  if (data.notes?.trim() && nextIsLiving && !target.linkedUid) {
    throw new Error('Relationship notes can be added after this living relative claims their family record, or when marked as deceased.');
  }

  const nextRel = data.relationshipType ? safeRelationship(data.relationshipType) : target.relationshipType;
  const path = `users/${uid}/familyMembers/${target.id}`;

  const updatePayload: Record<string, unknown> = {
    relationshipType: nextRel,
    inverseRelationshipType: getInverseRelationship(nextRel),
    notes:
      target.linkedUid
        ? data.notes !== undefined
          ? clamp(data.notes, 600)
          : target.notes
        : nextIsLiving
        ? ''
        : data.notes !== undefined
        ? clamp(data.notes, 600)
        : target.notes,
    updatedAt: serverTimestamp(),
  };

  if (!target.linkedUid) {
    const nextFirstName = data.firstName !== undefined ? clamp(data.firstName, 80) : target.firstName;
    const nextLastName = data.lastName !== undefined ? clamp(data.lastName, 80) : target.lastName;
    if (!nextFirstName || !nextLastName) {
      throw new Error('First name and last name are required.');
    }
    updatePayload.firstName = nextFirstName;
    updatePayload.lastName = nextLastName;
    updatePayload.gender = data.gender !== undefined ? safeGender(data.gender) : target.gender;
    updatePayload.isLiving = nextIsLiving;

    if (nextIsLiving) {
      updatePayload.otherNames = '';
      updatePayload.birthDate = '';
      updatePayload.deathDate = '';
      updatePayload.originPlaceName = '';
      updatePayload.originPlaceCountry = '';
    } else {
      updatePayload.otherNames =
        data.otherNames !== undefined ? clamp(data.otherNames, 120) : target.otherNames;
      updatePayload.birthDate =
        data.birthDate !== undefined ? clamp(data.birthDate, 32) : target.birthDate || '';
      updatePayload.deathDate =
        data.deathDate !== undefined ? clamp(data.deathDate, 32) : target.deathDate || '';
      updatePayload.originPlaceName =
        data.originPlace !== undefined
          ? clamp(data.originPlace?.name, 120)
          : target.originPlaceName;
      updatePayload.originPlaceCountry =
        data.originPlace !== undefined
          ? clamp(data.originPlace?.country, 100)
          : target.originPlaceCountry;
    }
  }

  try {
    await updateDoc(doc(db, 'users', uid, 'familyMembers', target.id), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await recordActivityEventFs(uid, 'RELATIONSHIP_UPDATED', `Updated relationship #${target.numericId}`, 'relationship');
}

export async function removeRelationshipFs(uid: string, relationshipIdOrPersonId: number): Promise<void> {
  requireVerifiedCurrentUser();
  const existing = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const target = existing.find((m) => m.numericId === relationshipIdOrPersonId);
  if (!target) throw new Error('Relationship not found.');

  const path = `users/${uid}/familyMembers/${target.id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'familyMembers', target.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  if (target.pendingInviteId) {
    const invPath = `familyInvitations/${target.pendingInviteId}`;
    try {
      const invSnap = await getDoc(doc(db, 'familyInvitations', target.pendingInviteId));
      if (invSnap.exists() && (invSnap.data() as FamilyInvitationDoc).status === 'pending') {
        await updateDoc(doc(db, 'familyInvitations', target.pendingInviteId), {
          status: 'revoked',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, invPath);
    }
  }

  await recordActivityEventFs(uid, 'RELATIONSHIP_REMOVED', 'Removed family connection', 'relationship');
}

export async function createFamilyInvitationFs(
  uid: string,
  data: {
    personId: number;
    inviteeEmail: string;
    relationshipType: string;
  },
): Promise<{ inviteCode: string }> {
  const user = requireVerifiedCurrentUser();
  const inviteeEmail = data.inviteeEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail) || inviteeEmail.length > 254) {
    throw new Error('Enter a valid email address for the invited relative.');
  }
  if (user.email && inviteeEmail === user.email.trim().toLowerCase()) {
    throw new Error('You cannot invite your own email address.');
  }

  const members = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const member = members.find((m) => m.numericId === data.personId);
  if (!member || member.linkedUid) {
    throw new Error('Only an unclaimed family record in your tree can be invited.');
  }
  if (!member.isLiving) {
    throw new Error('Deceased family members cannot be invited to claim an account.');
  }

  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) throw new Error('User account record not found.');
  const userDoc = userSnap.data() as UserAccountDoc;

  const inviteCode = generateInviteCode();
  const inviteCodeHash = await sha256Hex(inviteCode);
  const inviteId = generateSafeId('inv');
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'familyMembers', member.id), {
    pendingInviteId: inviteId,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'familyInvitations', inviteId), {
    id: inviteId,
    numericId: toNumericId(inviteId),
    inviterUid: uid,
    inviterName: clamp(userDoc.displayName || `${userDoc.firstName} ${userDoc.lastName}`, 120) || 'GeoSmart Member',
    inviterFirstName: clamp(userDoc.firstName, 80) || 'GeoSmart',
    inviterLastName: clamp(userDoc.lastName, 80),
    inviterGender: safeGender(userDoc.gender),
    memberId: member.id,
    memberNumericId: member.numericId,
    personName: clamp(`${member.firstName} ${member.lastName}`, 160),
    inviteeEmail: clamp(inviteeEmail, 254),
    inviteCodeHash,
    relationshipType: member.relationshipType,
    gender: safeGender(member.gender),
    inviterFamilyCount: members.length,
    status: 'pending',
    acceptedByUid: '',
    expiresAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `familyInvitations/${inviteId}`);
  }

  await recordActivityEventFs(
    uid,
    'FAMILY_INVITATION_CREATED',
    `Created family invitation for ${member.firstName} ${member.lastName} (${member.relationshipType})`,
    'person',
  );

  return { inviteCode };
}

export async function getSentFamilyInvitationsFs(uid: string): Promise<FamilyInvitationRecord[]> {
  const path = 'familyInvitations';
  let docs: FamilyInvitationDoc[] = [];
  try {
    const q = query(collection(db, path), where('inviterUid', '==', uid));
    const snap = await getDocs(q);
    docs = snap.docs.map((d) => d.data() as FamilyInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  return [...docs]
    .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt))
    .map((inv) => ({
      id: inv.numericId,
      inviterUserId: toNumericId(inv.inviterUid),
      inviterName: inv.inviterName,
      personId: inv.memberNumericId,
      personName: inv.personName,
      inviteeEmail: inv.inviteeEmail,
      inviteCode: null,
      relationshipType: inv.relationshipType,
      gender: inv.gender === 'unspecified' ? null : inv.gender,
      status: inv.status,
      expiresAt: tsToIso(inv.expiresAt),
      createdAt: tsToIso(inv.createdAt),
      acceptedAt: inv.acceptedAt ? tsToIso(inv.acceptedAt) : null,
    }));
}

async function listReceivedPendingInvitations(email: string, uid: string): Promise<FamilyInvitationDoc[]> {
  const emailLower = email.trim().toLowerCase();
  const path = 'familyInvitations';
  let docs: FamilyInvitationDoc[] = [];
  try {
    const q = query(collection(db, path), where('inviteeEmail', '==', emailLower));
    const snap = await getDocs(q);
    docs = snap.docs.map((d) => d.data() as FamilyInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  const now = Date.now();
  return docs.filter(
    (inv) =>
      inv.inviterUid !== uid &&
      inv.status === 'pending' &&
      tsToMs(inv.expiresAt) > now,
  );
}

export async function getKinshipDiscoverySuggestionsFs(
  uid: string,
): Promise<{ suggestions: KinshipDiscoveryMatch[]; emailVerified: boolean }> {
  const fbUser = auth.currentUser;
  if (!fbUser || fbUser.uid !== uid || !fbUser.email) {
    return { suggestions: [], emailVerified: false };
  }
  if (!fbUser.emailVerified) {
    return { suggestions: [], emailVerified: false };
  }

  const pending = await listReceivedPendingInvitations(fbUser.email, uid);
  return {
    emailVerified: true,
    suggestions: pending.map((inv) => ({
      invitationId: inv.numericId,
      personId: inv.memberNumericId,
      discoveredByUserId: toNumericId(inv.inviterUid),
      discoveredByName: inv.inviterName || 'A GeoSmart member',
      suggestedRelationship: inv.relationshipType,
      suggestedGender: inv.gender === 'unspecified' ? null : inv.gender,
      personName: inv.personName,
      matchReason: 'A family invitation was sent to your verified email address.',
      totalFamilyInNetwork: inv.inviterFamilyCount,
    })),
  };
}

async function acceptInvitationDoc(uid: string, inviteDoc: FamilyInvitationDoc): Promise<void> {
  const existingFamily = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const alreadyLinked = existingFamily.find((m) => m.linkedUid === inviteDoc.inviterUid);

  const reciprocalType = getInverseRelationship(inviteDoc.relationshipType);
  const newMemberId = generateSafeId('mem');

  const batch = writeBatch(db);
  batch.update(doc(db, 'familyInvitations', inviteDoc.id), {
    status: 'accepted',
    acceptedByUid: uid,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', inviteDoc.inviterUid, 'familyMembers', inviteDoc.memberId), {
    linkedUid: uid,
    updatedAt: serverTimestamp(),
  });

  if (!alreadyLinked) {
    batch.set(doc(db, 'users', uid, 'familyMembers', newMemberId), {
      id: newMemberId,
      numericId: toNumericId(newMemberId),
      ownerUid: uid,
      linkedUid: inviteDoc.inviterUid,
      pendingInviteId: '',
      firstName: clamp(inviteDoc.inviterFirstName || 'Family', 80) || 'Family',
      lastName: clamp(inviteDoc.inviterLastName || 'Member', 80) || 'Member',
      otherNames: '',
      gender: safeGender(inviteDoc.inviterGender),
      isLiving: true,
      relationshipType: reciprocalType,
      inverseRelationshipType: inviteDoc.relationshipType,
      notes: '',
      visibility: 'private',
      originPlaceName: '',
      originPlaceCountry: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `familyInvitations/${inviteDoc.id}`);
  }

  await recordActivityEventFs(uid, 'FAMILY_INVITATION_ACCEPTED', 'Accepted a family invitation', 'person');
}

export async function claimDiscoveredPersonFs(uid: string, invitationNumericId: number): Promise<void> {
  const user = requireVerifiedCurrentUser();
  if (!user.email) throw new Error('A verified email is required to accept this invitation.');

  const pending = await listReceivedPendingInvitations(user.email, uid);
  const match = pending.find((inv) => inv.numericId === invitationNumericId);
  if (!match) {
    throw new Error('This invitation is no longer available or has expired.');
  }

  await acceptInvitationDoc(uid, match);
}

export async function acceptFamilyInvitationByCodeFs(uid: string, inviteCode: string): Promise<void> {
  const user = requireVerifiedCurrentUser();
  if (!user.email) throw new Error('A verified email is required to accept this invitation.');

  const cleanCode = inviteCode.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(cleanCode)) {
    throw new Error('Invalid or expired invitation code.');
  }

  const hash = await sha256Hex(cleanCode);
  const pending = await listReceivedPendingInvitations(user.email, uid);
  const match = pending.find((inv) => inv.inviteCodeHash === hash);
  if (!match) {
    throw new Error('Invalid or expired invitation code for this email address.');
  }

  await acceptInvitationDoc(uid, match);
}

export async function getFamilyInvitationNotificationStateFs(
  uid: string,
): Promise<{ pendingCount: number; groupsPendingCount: number; hasUnreadActivity: boolean; alertsEnabled: boolean }> {
  const fbUser = auth.currentUser;
  const userPath = `users/${uid}`;
  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
  if (!userSnap.exists()) {
    return { pendingCount: 0, groupsPendingCount: 0, hasUnreadActivity: false, alertsEnabled: true };
  }
  const userDoc = userSnap.data() as UserAccountDoc;
  const readMs = tsToMs(userDoc.activityReadAt);
  const now = Date.now();

  let sentInvites: FamilyInvitationDoc[] = [];
  try {
    const q = query(collection(db, 'familyInvitations'), where('inviterUid', '==', uid));
    const snap = await getDocs(q);
    sentInvites = snap.docs.map((d) => d.data() as FamilyInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyInvitations');
  }

  let receivedPending: FamilyInvitationDoc[] = [];
  if (fbUser && fbUser.emailVerified && fbUser.email) {
    receivedPending = await listReceivedPendingInvitations(fbUser.email, uid);
  }

  let incomingGroupInvites: FamilyGroupInvitationDoc[] = [];
  try {
    const gq = query(collection(db, 'familyGroupInvitations'), where('inviteeUid', '==', uid));
    const gSnap = await getDocs(gq);
    incomingGroupInvites = gSnap.docs.map((d) => d.data() as FamilyGroupInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroupInvitations');
  }

  const pendingGroupInvites = incomingGroupInvites.filter(
    (inv) => inv.status === 'pending' && tsToMs(inv.expiresAt) > now,
  );
  const groupsPendingCount = pendingGroupInvites.length;
  const hasUnreadGroupInvites = pendingGroupInvites.some(
    (inv) => tsToMs(inv.invitedAt || inv.createdAt) > readMs,
  );

  const sentPendingCount = sentInvites.filter(
    (inv) => inv.status === 'pending' && tsToMs(inv.expiresAt) > now,
  ).length;
  const pendingCount = sentPendingCount + receivedPending.length;

  const hasUnreadClaimed = sentInvites.some(
    (inv) => inv.status === 'accepted' && inv.acceptedAt && tsToMs(inv.acceptedAt) > readMs,
  );
  const hasUnreadReceived = receivedPending.some((inv) => tsToMs(inv.createdAt) > readMs);

  return {
    pendingCount,
    groupsPendingCount,
    hasUnreadActivity: hasUnreadClaimed || hasUnreadReceived || hasUnreadGroupInvites,
    alertsEnabled: Boolean(userDoc.alertsEnabled),
  };
}

export async function markFamilyInvitationActivityReadFs(uid: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      activityReadAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setFamilyInvitationAlertsEnabledFs(uid: string, enabled: boolean): Promise<void> {
  requireVerifiedCurrentUser();
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      alertsEnabled: Boolean(enabled),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getUserFamilyGroupsFs(uid: string): Promise<FamilyGroup[]> {
  requireVerifiedCurrentUser();
  let groupDocs: FamilyGroupDoc[] = [];
  try {
    const q = query(collection(db, 'familyGroups'), where('memberUids', 'array-contains', uid));
    const snap = await getDocs(q);
    groupDocs = snap.docs.map((d) => d.data() as FamilyGroupDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroups');
  }

  let sentInvites: FamilyGroupInvitationDoc[] = [];
  try {
    const invQ = query(collection(db, 'familyGroupInvitations'), where('inviterUid', '==', uid));
    const invSnap = await getDocs(invQ);
    sentInvites = invSnap.docs.map((d) => d.data() as FamilyGroupInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroupInvitations');
  }

  const now = Date.now();
  const sortedGroups = [...groupDocs].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

  return Promise.all(
    sortedGroups.map(async (group) => {
      const isOwner = group.organizerUid === uid;
      let memberDocs: FamilyGroupMemberDoc[] = [];
      try {
        const memSnap = await getDocs(collection(db, 'familyGroups', group.id, 'members'));
        memberDocs = memSnap.docs.map((d) => d.data() as FamilyGroupMemberDoc);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `familyGroups/${group.id}/members`);
      }

      const acceptedMembers: FamilyGroupMember[] = [...memberDocs]
        .sort((a, b) => {
          if (a.isOrganizer !== b.isOrganizer) return a.isOrganizer ? -1 : 1;
          return tsToMs(a.joinedAt) - tsToMs(b.joinedAt);
        })
        .map((m) => ({
          userId: m.numericId,
          userUid: m.uid,
          name: m.name || (m.isOrganizer ? 'Group organiser' : 'Family member'),
          personId: m.isOrganizer ? null : m.personNumericId || null,
          relationshipType: m.isOrganizer ? 'self' : m.relationshipType || 'relative',
          joinedAt: tsToIso(m.joinedAt),
          status: 'accepted',
          isOrganizer: Boolean(m.isOrganizer),
          isCurrentUser: m.uid === uid,
        }));

      const acceptedUids = new Set(acceptedMembers.map((m) => m.userUid));
      const pendingInvites: FamilyGroupMember[] = isOwner
        ? sentInvites
            .filter(
              (inv) =>
                inv.groupId === group.id &&
                inv.status === 'pending' &&
                tsToMs(inv.expiresAt) > now &&
                !acceptedUids.has(inv.inviteeUid),
            )
            .sort((a, b) => tsToMs(b.invitedAt || b.createdAt) - tsToMs(a.invitedAt || a.createdAt))
            .map((inv) => ({
              userId: toNumericId(inv.inviteeUid),
              userUid: inv.inviteeUid,
              name: inv.inviteeName || 'Family member',
              personId: inv.personNumericId,
              relationshipType: inv.relationshipType,
              joinedAt: tsToIso(inv.invitedAt || inv.createdAt),
              status: 'pending',
              isOrganizer: false,
              isCurrentUser: false,
            }))
        : [];

      return {
        id: group.numericId,
        groupId: group.id,
        name: group.name,
        description: group.description || null,
        createdAt: tsToIso(group.createdAt),
        isOwner,
        members: [...acceptedMembers, ...pendingInvites],
      };
    }),
  );
}

export async function createUserFamilyGroupFs(
  uid: string,
  input: { name: string; description?: string | null; personIds: number[]; inviteConfirmed: boolean },
): Promise<{ id: number; groupId: string }> {
  requireVerifiedCurrentUser();
  if (input.inviteConfirmed !== true) {
    throw new Error('Confirm that the selected account holders should be invited to this group.');
  }
  const name = clamp(input.name, 100);
  if (!name) throw new Error('Enter a group name up to 100 characters.');
  const rawDescription = (input.description || '').trim();
  if (rawDescription.length > 1000) {
    throw new Error('Group description must be 1,000 characters or fewer.');
  }
  const description = clamp(rawDescription, 1000);

  const uniquePersonIds = Array.from(new Set(input.personIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniquePersonIds.length === 0) {
    throw new Error('Choose at least one family member to invite.');
  }
  if (uniquePersonIds.length > 49) {
    throw new Error('A family group can include up to 50 members.');
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  if (!userSnap.exists()) throw new Error('Account profile not found.');
  const userDoc = userSnap.data() as UserAccountDoc;
  const organizerName =
    clamp(userDoc.displayName || `${userDoc.firstName} ${userDoc.lastName}`.trim(), 120) || 'Group organiser';

  const memberDocs = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const memberByPersonId = new Map(memberDocs.map((m) => [m.numericId, m]));
  const selectedDocs: FamilyMemberDoc[] = [];
  const seenLinkedUids = new Set<string>();

  for (const personId of uniquePersonIds) {
    const member = memberByPersonId.get(personId);
    if (!member) {
      throw new Error('Groups can invite only people already connected to your family.');
    }
    if (!member.linkedUid || member.linkedUid === uid) {
      throw new Error(
        'Every group participant needs a GeoSmart account. Invite relatives to GeoSmart first, then add them to a group.',
      );
    }
    if (!seenLinkedUids.has(member.linkedUid)) {
      seenLinkedUids.add(member.linkedUid);
      selectedDocs.push(member);
    }
  }

  const groupId = generateSafeId('grp');
  const groupNumericId = toNumericId(groupId);
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const batch = writeBatch(db);

  batch.set(doc(db, 'familyGroups', groupId), {
    id: groupId,
    numericId: groupNumericId,
    name,
    description,
    organizerUid: uid,
    organizerName,
    memberUids: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'familyGroups', groupId, 'members', uid), {
    uid,
    numericId: userDoc.numericId,
    groupId,
    name: organizerName,
    personNumericId: 0,
    relationshipType: 'self',
    isOrganizer: true,
    joinedAt: serverTimestamp(),
  });

  for (const member of selectedDocs) {
    const inviteId = `${groupId}__${member.linkedUid}`;
    const inviteeName =
      clamp(`${member.firstName} ${member.lastName}`.trim(), 120) || 'Family member';
    batch.set(doc(db, 'familyGroupInvitations', inviteId), {
      id: inviteId,
      numericId: toNumericId(inviteId),
      groupId,
      groupName: name,
      groupDescription: description,
      inviterUid: uid,
      inviterName: organizerName,
      inviteeUid: member.linkedUid,
      inviteeName,
      personNumericId: member.numericId,
      relationshipType: member.relationshipType,
      status: 'pending',
      expiresAt,
      invitedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `familyGroups/${groupId}`);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_CREATED', `Created family group: ${name}`, 'family_group');
  return { id: groupNumericId, groupId };
}

export async function updateUserFamilyGroupFs(
  uid: string,
  groupId: string,
  input: { name: string; description?: string | null },
): Promise<{ success: boolean; name: string }> {
  requireVerifiedCurrentUser();
  const name = clamp(input.name, 100);
  if (!name) throw new Error('Enter a group name up to 100 characters.');
  const rawDescription = (input.description || '').trim();
  if (rawDescription.length > 1000) {
    throw new Error('Group description must be 1,000 characters or fewer.');
  }
  const description = clamp(rawDescription, 1000);

  const path = `familyGroups/${groupId}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'familyGroups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) throw new Error('Family group not found.');
  const group = snap.data() as FamilyGroupDoc;
  if (group.organizerUid !== uid) {
    throw new Error('Only the group organiser can rename this group.');
  }

  try {
    await updateDoc(doc(db, 'familyGroups', groupId), {
      name,
      description,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_UPDATED', `Updated family group: ${name}`, 'family_group');
  return { success: true, name };
}

export async function deleteUserFamilyGroupFs(uid: string, groupId: string): Promise<{ success: boolean }> {
  requireVerifiedCurrentUser();
  const path = `familyGroups/${groupId}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'familyGroups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) throw new Error('Group not found.');
  const group = snap.data() as FamilyGroupDoc;
  if (group.organizerUid !== uid) {
    throw new Error('Group not found or permission denied.');
  }

  const refsToDelete: Array<ReturnType<typeof doc>> = [];

  try {
    const postsSnap = await getDocs(collection(db, 'familyGroups', groupId, 'posts'));
    for (const postDoc of postsSnap.docs) {
      const commentsSnap = await getDocs(
        collection(db, 'familyGroups', groupId, 'posts', postDoc.id, 'comments'),
      );
      for (const commentDoc of commentsSnap.docs) {
        refsToDelete.push(commentDoc.ref);
      }
      refsToDelete.push(postDoc.ref);
    }

    const membersSnap = await getDocs(collection(db, 'familyGroups', groupId, 'members'));
    for (const memDoc of membersSnap.docs) {
      refsToDelete.push(memDoc.ref);
    }

    const invSnap = await getDocs(
      query(collection(db, 'familyGroupInvitations'), where('inviterUid', '==', uid)),
    );
    for (const invDoc of invSnap.docs) {
      const data = invDoc.data() as FamilyGroupInvitationDoc;
      if (data.groupId === groupId) refsToDelete.push(invDoc.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  for (let i = 0; i < refsToDelete.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of refsToDelete.slice(i, i + 400)) {
      batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  try {
    await deleteDoc(doc(db, 'familyGroups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_DELETED', `Deleted family group: ${group.name}`, 'family_group');
  return { success: true };
}

export async function inviteToFamilyGroupFs(
  uid: string,
  groupId: string,
  personId: number,
): Promise<{ success: boolean }> {
  requireVerifiedCurrentUser();
  const groupPath = `familyGroups/${groupId}`;
  let groupSnap;
  try {
    groupSnap = await getDoc(doc(db, 'familyGroups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, groupPath);
  }
  if (!groupSnap.exists()) throw new Error('Family group not found.');
  const group = groupSnap.data() as FamilyGroupDoc;
  if (group.organizerUid !== uid) {
    throw new Error('Only the group organiser can invite members.');
  }
  if (group.memberUids.length >= 50) {
    throw new Error('This group has reached the maximum of 50 members.');
  }

  const memberDocs = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const person = memberDocs.find((m) => m.numericId === personId);
  if (!person || !person.linkedUid || person.linkedUid === uid) {
    throw new Error('Choose a connected relative with a GeoSmart account.');
  }
  if (group.memberUids.includes(person.linkedUid)) {
    throw new Error('This person is already a member of the group.');
  }

  let sentInvites: FamilyGroupInvitationDoc[] = [];
  try {
    const invSnap = await getDocs(
      query(collection(db, 'familyGroupInvitations'), where('inviterUid', '==', uid)),
    );
    sentInvites = invSnap.docs.map((d) => d.data() as FamilyGroupInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroupInvitations');
  }

  const inviteId = `${groupId}__${person.linkedUid}`;
  const existingInvite = sentInvites.find((inv) => inv.id === inviteId);
  if (existingInvite?.status === 'accepted') {
    throw new Error('This person is already a member of the group.');
  }
  if (existingInvite?.status === 'pending' && tsToMs(existingInvite.expiresAt) > Date.now()) {
    throw new Error('An invitation is already pending for this person.');
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  const userDoc = userSnap.exists() ? (userSnap.data() as UserAccountDoc) : null;
  const inviterName =
    clamp(userDoc?.displayName || group.organizerName || 'Group organiser', 120) || 'Group organiser';
  const inviteeName = clamp(`${person.firstName} ${person.lastName}`.trim(), 120) || 'Family member';
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  try {
    if (existingInvite) {
      await updateDoc(doc(db, 'familyGroupInvitations', inviteId), {
        groupName: clamp(group.name, 100),
        groupDescription: clamp(group.description, 1000),
        inviterName,
        inviteeName,
        personNumericId: person.numericId,
        relationshipType: person.relationshipType,
        status: 'pending',
        expiresAt,
        invitedAt: serverTimestamp(),
        acceptedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'familyGroupInvitations', inviteId), {
        id: inviteId,
        numericId: toNumericId(inviteId),
        groupId,
        groupName: clamp(group.name, 100),
        groupDescription: clamp(group.description, 1000),
        inviterUid: uid,
        inviterName,
        inviteeUid: person.linkedUid,
        inviteeName,
        personNumericId: person.numericId,
        relationshipType: person.relationshipType,
        status: 'pending',
        expiresAt,
        invitedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `familyGroupInvitations/${inviteId}`);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_INVITATION_SENT', `Invited a relative to ${group.name}`, 'family_group');
  return { success: true };
}

export async function getIncomingFamilyGroupInvitationsFs(
  uid: string,
): Promise<FamilyGroupInvitationSummary[]> {
  requireVerifiedCurrentUser();
  let docs: FamilyGroupInvitationDoc[] = [];
  try {
    const q = query(collection(db, 'familyGroupInvitations'), where('inviteeUid', '==', uid));
    const snap = await getDocs(q);
    docs = snap.docs.map((d) => d.data() as FamilyGroupInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroupInvitations');
  }

  const now = Date.now();
  return docs
    .filter((inv) => inv.status === 'pending' && tsToMs(inv.expiresAt) > now)
    .sort((a, b) => tsToMs(b.invitedAt || b.createdAt) - tsToMs(a.invitedAt || a.createdAt))
    .map((inv) => ({
      id: inv.numericId,
      invitationId: inv.id,
      groupId: inv.groupId,
      groupNumericId: toNumericId(inv.groupId),
      groupName: inv.groupName,
      groupDescription: inv.groupDescription || null,
      inviterUserId: toNumericId(inv.inviterUid),
      inviterName: inv.inviterName || 'A family member',
      createdAt: tsToIso(inv.invitedAt || inv.createdAt),
      expiresAt: tsToIso(inv.expiresAt),
    }));
}

export async function respondToFamilyGroupInvitationFs(
  uid: string,
  invitationId: string,
  accept: boolean,
): Promise<{ success: boolean; accepted: boolean }> {
  requireVerifiedCurrentUser();
  const invPath = `familyGroupInvitations/${invitationId}`;
  let invSnap;
  try {
    invSnap = await getDoc(doc(db, 'familyGroupInvitations', invitationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, invPath);
  }
  if (!invSnap.exists()) throw new Error('Invitation is no longer available.');
  const inv = invSnap.data() as FamilyGroupInvitationDoc;
  if (inv.inviteeUid !== uid || inv.status !== 'pending' || tsToMs(inv.expiresAt) <= Date.now()) {
    throw new Error('Invitation is no longer available.');
  }

  if (!accept) {
    try {
      await updateDoc(doc(db, 'familyGroupInvitations', invitationId), {
        status: 'declined',
        acceptedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, invPath);
    }
    await recordActivityEventFs(uid, 'FAMILY_GROUP_INVITATION_DECLINED', 'Declined a family group invitation', 'family_group');
    return { success: true, accepted: false };
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  const userDoc = userSnap.exists() ? (userSnap.data() as UserAccountDoc) : null;
  const memberName =
    clamp(
      userDoc?.displayName || `${userDoc?.firstName || ''} ${userDoc?.lastName || ''}`.trim() || inv.inviteeName,
      120,
    ) || 'Family member';

  const batch = writeBatch(db);
  batch.update(doc(db, 'familyGroupInvitations', invitationId), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'familyGroups', inv.groupId), {
    memberUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'familyGroups', inv.groupId, 'members', uid), {
    uid,
    numericId: userDoc?.numericId || toNumericId(uid),
    groupId: inv.groupId,
    name: memberName,
    personNumericId: inv.personNumericId,
    relationshipType: inv.relationshipType,
    isOrganizer: false,
    joinedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, invPath);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_INVITATION_ACCEPTED', 'Joined a family group', 'family_group');
  return { success: true, accepted: true };
}

export async function removeFamilyGroupMemberFs(
  actorUid: string,
  groupId: string,
  targetUid: string,
): Promise<{ success: boolean; groupName: string }> {
  requireVerifiedCurrentUser();
  const groupPath = `familyGroups/${groupId}`;
  let groupSnap;
  try {
    groupSnap = await getDoc(doc(db, 'familyGroups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, groupPath);
  }
  if (!groupSnap.exists()) throw new Error('Family group not found.');
  const group = groupSnap.data() as FamilyGroupDoc;

  if (targetUid === group.organizerUid) {
    throw new Error('The organiser cannot leave this group. Delete the group if you no longer want to run it.');
  }
  const isOrganizer = actorUid === group.organizerUid;
  if (!isOrganizer && actorUid !== targetUid) {
    throw new Error('Only the organiser can remove another member.');
  }

  const inviteId = `${groupId}__${targetUid}`;
  const invRef = doc(db, 'familyGroupInvitations', inviteId);
  let invSnap;
  try {
    invSnap = await getDoc(invRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `familyGroupInvitations/${inviteId}`);
  }
  if (!invSnap.exists()) {
    throw new Error('This person is not an active group member or invitee.');
  }
  const inv = invSnap.data() as FamilyGroupInvitationDoc;
  if (inv.status !== 'pending' && inv.status !== 'accepted') {
    throw new Error('This person is not an active group member or invitee.');
  }

  const batch = writeBatch(db);
  batch.update(invRef, {
    status: 'revoked',
    acceptedAt: deleteField(),
    updatedAt: serverTimestamp(),
  });

  if (group.memberUids.includes(targetUid) || inv.status === 'accepted') {
    batch.update(doc(db, 'familyGroups', groupId), {
      memberUids: arrayRemove(targetUid),
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'familyGroups', groupId, 'members', targetUid));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, groupPath);
  }

  await recordActivityEventFs(
    actorUid,
    isOrganizer ? 'FAMILY_GROUP_MEMBER_REMOVED' : 'FAMILY_GROUP_MEMBER_LEFT',
    isOrganizer ? 'Removed a member from a family group' : 'Left a family group',
    'family_group',
  );
  return { success: true, groupName: group.name };
}

export async function getFamilyGroupPostsFs(uid: string, groupId: string): Promise<FamilyGroupPost[]> {
  requireVerifiedCurrentUser();
  if (!uid) throw new Error('Sign in required.');
  const postsPath = `familyGroups/${groupId}/posts`;
  let postDocs: FamilyGroupPostDoc[] = [];
  try {
    const snap = await getDocs(collection(db, 'familyGroups', groupId, 'posts'));
    postDocs = snap.docs.map((d) => d.data() as FamilyGroupPostDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, postsPath);
  }

  const sortedPosts = [...postDocs].sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

  return Promise.all(
    sortedPosts.map(async (post) => {
      let commentDocs: FamilyGroupCommentDoc[] = [];
      const commentsPath = `familyGroups/${groupId}/posts/${post.id}/comments`;
      try {
        const cSnap = await getDocs(
          collection(db, 'familyGroups', groupId, 'posts', post.id, 'comments'),
        );
        commentDocs = cSnap.docs.map((d) => d.data() as FamilyGroupCommentDoc);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, commentsPath);
      }

      const comments: FamilyGroupComment[] = [...commentDocs]
        .sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt))
        .map((c) => ({
          id: c.numericId,
          commentId: c.id,
          body: c.body,
          authorUserId: toNumericId(c.authorUid),
          authorName: c.authorName || 'Group member',
          createdAt: tsToIso(c.createdAt),
        }));

      return {
        id: post.numericId,
        postId: post.id,
        body: post.body,
        authorUserId: toNumericId(post.authorUid),
        authorName: post.authorName || 'Group member',
        createdAt: tsToIso(post.createdAt),
        comments,
      };
    }),
  );
}

export async function createFamilyGroupPostFs(
  uid: string,
  groupId: string,
  body: string,
): Promise<{ id: number; postId: string }> {
  requireVerifiedCurrentUser();
  const content = body.trim();
  if (!content || content.length > 5000) {
    throw new Error('Write a post up to 5,000 characters.');
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  const userDoc = userSnap.exists() ? (userSnap.data() as UserAccountDoc) : null;
  const authorName =
    clamp(userDoc?.displayName || `${userDoc?.firstName || ''} ${userDoc?.lastName || ''}`.trim(), 120) ||
    'Group member';

  const postId = generateSafeId('pst');
  const numericId = toNumericId(postId);
  const path = `familyGroups/${groupId}/posts/${postId}`;

  try {
    await setDoc(doc(db, 'familyGroups', groupId, 'posts', postId), {
      id: postId,
      numericId,
      groupId,
      authorUid: uid,
      authorName,
      body: content,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_POST_CREATED', 'Posted in a family group', 'family_group_post');
  return { id: numericId, postId };
}

export async function createFamilyGroupCommentFs(
  uid: string,
  groupId: string,
  postId: string,
  body: string,
): Promise<{ id: number; commentId: string }> {
  requireVerifiedCurrentUser();
  const content = body.trim();
  if (!content || content.length > 2000) {
    throw new Error('Write a reply up to 2,000 characters.');
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  const userDoc = userSnap.exists() ? (userSnap.data() as UserAccountDoc) : null;
  const authorName =
    clamp(userDoc?.displayName || `${userDoc?.firstName || ''} ${userDoc?.lastName || ''}`.trim(), 120) ||
    'Group member';

  const commentId = generateSafeId('cmt');
  const numericId = toNumericId(commentId);
  const path = `familyGroups/${groupId}/posts/${postId}/comments/${commentId}`;

  try {
    await setDoc(doc(db, 'familyGroups', groupId, 'posts', postId, 'comments', commentId), {
      id: commentId,
      numericId,
      groupId,
      postId,
      authorUid: uid,
      authorName,
      body: content,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(uid, 'FAMILY_GROUP_COMMENT_CREATED', 'Replied to a family group post', 'family_group_post');
  return { id: numericId, commentId };
}

async function getStoryOwnerDisplayNameFs(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const u = snap.data() as UserAccountDoc;
      const name = clamp(
        u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'GeoSmart member',
        120,
      );
      if (name) return name;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  return 'GeoSmart member';
}

async function getConnectedFamilyUidsFs(uid: string): Promise<string[]> {
  const members = await listOwnerSubcollection<FamilyMemberDoc>(uid, 'familyMembers');
  const unique = new Set<string>([uid]);
  for (const m of members) {
    const linked = (m.linkedUid || '').trim();
    if (linked && /^[a-zA-Z0-9_-]{1,128}$/.test(linked)) {
      unique.add(linked);
    }
    if (unique.size >= 50) break;
  }
  return Array.from(unique);
}

export async function createFamilyStoryFs(
  uid: string,
  input: {
    title: string;
    description?: string | null;
    storagePath: string;
    contentType: string;
    mediaType: 'audio' | 'video';
    fileSize: number;
    visibility: 'private' | 'family';
  },
): Promise<{ id: number; storyId: string }> {
  requireVerifiedCurrentUser();
  const storyId = generateSafeId('sty');
  const numericId = toNumericId(storyId);
  const ownerName = await getStoryOwnerDisplayNameFs(uid);
  const cleanTitle = clamp(input.title, 120);
  const cleanDescription = clamp(input.description, 1200);
  const cleanContentType =
    clamp(input.contentType, 80) || (input.mediaType === 'audio' ? 'audio/mp4' : 'video/mp4');
  const cleanStoragePath = input.storagePath.trim();
  const cleanFileSize = Math.max(1, Math.min(52428800, Math.floor(input.fileSize)));

  const storyPayload = {
    id: storyId,
    numericId,
    ownerUid: uid,
    ownerName,
    title: cleanTitle,
    description: cleanDescription,
    mediaType: input.mediaType,
    contentType: cleanContentType,
    fileSize: cleanFileSize,
    storagePath: cleanStoragePath,
    visibility: input.visibility,
    createdAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'stories', storyId), storyPayload);

  if (input.visibility === 'family') {
    const allowedUids = await getConnectedFamilyUidsFs(uid);
    batch.set(doc(db, 'sharedFamilyStories', storyId), {
      ...storyPayload,
      visibility: 'family',
      allowedUids,
      updatedAt: serverTimestamp(),
    });
  }

  const path = `users/${uid}/stories/${storyId}`;
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await recordActivityEventFs(
    uid,
    'FAMILY_STORY_CREATED',
    input.visibility === 'family'
      ? `Added and shared a family ${input.mediaType} story`
      : `Saved a private ${input.mediaType} story`,
    'family_story',
    {
      scope: 'family_story',
      previous: 'private',
      selected: input.visibility === 'family' ? 'shared' : 'private',
    },
  );

  return { id: numericId, storyId };
}

export async function getFamilyStoriesFs(uid: string): Promise<FamilyStorySummary[]> {
  const [ownerDocs, sharedDocs] = await Promise.all([
    listOwnerSubcollection<StoryDoc>(uid, 'stories'),
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'sharedFamilyStories'), where('allowedUids', 'array-contains', uid)),
        );
        return snap.docs.map((d) => d.data() as SharedFamilyStoryDoc);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'sharedFamilyStories');
      }
    })(),
  ]);

  // Keep audience synced if owner's direct family connections changed since sharing.
  const ownerSharedMap = new Map(sharedDocs.filter((d) => d.ownerUid === uid).map((d) => [d.id, d]));
  const storiesNeedingAudienceSync = ownerDocs.filter(
    (s) => s.visibility === 'family' && Boolean(s.storagePath),
  );
  if (storiesNeedingAudienceSync.length > 0) {
    const currentAllowed = await getConnectedFamilyUidsFs(uid);
    const currentAllowedKey = [...currentAllowed].sort().join(',');
    for (const story of storiesNeedingAudienceSync) {
      const mirror = ownerSharedMap.get(story.id);
      if (mirror && [...(mirror.allowedUids || [])].sort().join(',') !== currentAllowedKey) {
        await updateDoc(doc(db, 'sharedFamilyStories', story.id), {
          allowedUids: currentAllowed,
          ownerName: story.ownerName,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }

  const merged = new Map<string, StoryDoc | SharedFamilyStoryDoc>();
  for (const s of sharedDocs) {
    merged.set(s.id, s);
  }
  for (const s of ownerDocs) {
    merged.set(s.id, s);
  }

  return Array.from(merged.values())
    .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt))
    .map((s) => ({
      id: s.numericId,
      storyId: s.id,
      ownerUserId: toNumericId(s.ownerUid),
      ownerUid: s.ownerUid,
      ownerName: s.ownerName,
      title: s.title,
      description: s.description || null,
      mediaType: s.mediaType,
      contentType: s.contentType,
      fileSize: s.fileSize,
      storagePath: s.storagePath,
      visibility: s.visibility,
      createdAt: tsToIso(s.createdAt),
      isOwner: s.ownerUid === uid,
    }));
}

export async function updateFamilyStorySharingFs(
  uid: string,
  storyNumericId: number,
  visibility: 'private' | 'family',
): Promise<{ success: boolean; visibility: 'private' | 'family' }> {
  requireVerifiedCurrentUser();
  const docs = await listOwnerSubcollection<StoryDoc>(uid, 'stories');
  const target = docs.find((s) => s.numericId === storyNumericId);
  if (!target) throw new Error('Story not found or permission denied.');
  if (visibility === 'family' && !target.storagePath) {
    throw new Error('This legacy story has no stored media file to share. Please re-upload it.');
  }

  const sharedRef = doc(db, 'sharedFamilyStories', target.id);
  let sharedExists = false;
  try {
    const sharedSnap = await getDoc(sharedRef);
    sharedExists = sharedSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `sharedFamilyStories/${target.id}`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'stories', target.id), { visibility });

  if (visibility === 'family') {
    const allowedUids = await getConnectedFamilyUidsFs(uid);
    const ownerName = target.ownerName || (await getStoryOwnerDisplayNameFs(uid));
    if (sharedExists) {
      batch.update(sharedRef, {
        allowedUids,
        ownerName,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(sharedRef, {
        id: target.id,
        numericId: target.numericId,
        ownerUid: uid,
        ownerName,
        title: clamp(target.title, 120),
        description: clamp(target.description, 1200),
        mediaType: target.mediaType,
        contentType: clamp(target.contentType, 80) || 'application/octet-stream',
        fileSize: Math.max(1, Math.min(52428800, Math.floor(target.fileSize || 1))),
        storagePath: target.storagePath!,
        visibility: 'family',
        allowedUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else if (sharedExists) {
    batch.delete(sharedRef);
  }

  const path = `users/${uid}/stories/${target.id}`;
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  if (target.visibility !== visibility) {
    await recordActivityEventFs(
      uid,
      'FAMILY_STORY_SHARING_UPDATED',
      visibility === 'family'
        ? 'Shared a family story with direct connections'
        : 'Made a family story private',
      'family_story',
      {
        scope: 'family_story',
        previous: target.visibility === 'family' ? 'shared' : 'private',
        selected: visibility === 'family' ? 'shared' : 'private',
      },
    );
  }
  return { success: true, visibility };
}

export async function deleteFamilyStoryFs(
  uid: string,
  storyNumericId: number,
): Promise<{ storyId: string; storagePath: string | null }> {
  requireVerifiedCurrentUser();
  const docs = await listOwnerSubcollection<StoryDoc>(uid, 'stories');
  const target = docs.find((s) => s.numericId === storyNumericId);
  if (!target) throw new Error('Story not found.');

  const sharedRef = doc(db, 'sharedFamilyStories', target.id);
  let sharedExists = false;
  try {
    const sharedSnap = await getDoc(sharedRef);
    sharedExists = sharedSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `sharedFamilyStories/${target.id}`);
  }

  const batch = writeBatch(db);
  if (sharedExists) {
    batch.delete(sharedRef);
  }
  batch.delete(doc(db, 'users', uid, 'stories', target.id));

  const path = `users/${uid}/stories/${target.id}`;
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await recordActivityEventFs(
    uid,
    'FAMILY_STORY_DELETED',
    `Deleted family story "${clamp(target.title, 80)}"`,
    'family_story',
  );

  return { storyId: target.id, storagePath: target.storagePath || null };
}

export async function exportUserDataFs(uid: string): Promise<Record<string, unknown>> {
  const [overview, places, communities, familyMembers, familyTree, sentInvitations, stories, activityEvents] =
    await Promise.all([
      getUserOverviewFs(uid),
      getUserPlacesFs(uid),
      getUserCommunitiesFs(uid),
      getUserFamilyFs(uid),
      getUserFamilyTreeFs(uid),
      getSentFamilyInvitationsFs(uid),
      getFamilyStoriesFs(uid),
      listOwnerSubcollection<ActivityEventDoc>(uid, 'activityEvents'),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    platform: 'GeoSmart Individual Relationship Foundation',
    account: overview.user,
    person: overview.person,
    profile: overview.profile,
    places,
    communities,
    family: familyMembers,
    familyTree: familyTree.summary,
    invitations: sentInvitations,
    stories,
    activityLog: [...activityEvents]
      .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt))
      .map((ev) => ({
        id: ev.numericId,
        eventType: ev.eventType,
        summary: ev.summary,
        createdAt: tsToIso(ev.createdAt),
      })),
  };
}

export async function deleteUserAccountFs(uid: string): Promise<void> {
  requireVerifiedCurrentUser();

  // Clean up family groups organized by or involving this user before removing /users/{uid}
  try {
    const groupSnap = await getDocs(
      query(collection(db, 'familyGroups'), where('memberUids', 'array-contains', uid)),
    );
    for (const gDoc of groupSnap.docs) {
      const g = gDoc.data() as FamilyGroupDoc;
      if (g.organizerUid === uid) {
        await deleteUserFamilyGroupFs(uid, g.id);
      } else {
        await removeFamilyGroupMemberFs(uid, g.id, uid).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyGroups');
  }

  // Delete sharedFamilyStories owned by this user before removing /users/{uid}/stories/*
  try {
    const sharedSnap = await getDocs(
      query(collection(db, 'sharedFamilyStories'), where('allowedUids', 'array-contains', uid)),
    );
    const ownedSharedRefs = sharedSnap.docs
      .filter((d) => (d.data() as SharedFamilyStoryDoc).ownerUid === uid)
      .map((d) => d.ref);
    for (let i = 0; i < ownedSharedRefs.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of ownedSharedRefs.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'sharedFamilyStories');
  }

  const subcollections = ['places', 'communities', 'familyMembers', 'activityEvents', 'stories'] as const;
  const docRefs: Array<ReturnType<typeof doc>> = [];

  for (const sub of subcollections) {
    const subPath = `users/${uid}/${sub}`;
    try {
      const snap = await getDocs(query(collection(db, 'users', uid, sub), where('ownerUid', '==', uid)));
      for (const d of snap.docs) docRefs.push(d.ref);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, subPath);
    }
  }

  // Delete subcollections in batches before deleting /users/{uid} so Master Gate exists(/users/{uid}) stays true
  for (let i = 0; i < docRefs.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of docRefs.slice(i, i + 400)) {
      batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/*`);
    }
  }

  // Delete sharedProfile if it exists and finally delete /users/{uid}
  const finalBatch = writeBatch(db);
  try {
    const sp = await getDoc(doc(db, 'sharedProfiles', uid));
    if (sp.exists()) finalBatch.delete(doc(db, 'sharedProfiles', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `sharedProfiles/${uid}`);
  }
  finalBatch.delete(doc(db, 'users', uid));

  try {
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
}

export async function getAdminDashboardDataFs(searchQuery: string): Promise<{
  metrics: Record<string, number>;
  health: {
    database: 'healthy' | 'degraded' | 'error';
    dbLatencyMs: number;
    authService: 'healthy' | 'degraded';
    serverUptimeSeconds: number;
    recentErrorCount: number | null;
    timestamp: string;
  };
  activity: Array<{ id: number; eventType: string; eventDescription: string; createdAt: string }>;
  usersList: Array<{
    id: number;
    uid: string;
    email: string;
    displayName: string | null;
    role: string;
    status: string;
    onboardingCompleted: boolean;
    createdAt: string;
  }>;
  logs: AdminAccessLogEntry[];
}> {
  const adminUser = requireVerifiedCurrentUser();
  const started = performance.now();

  let userDocs: UserAccountDoc[] = [];
  try {
    const snap = await getDocs(collection(db, 'users'));
    userDocs = snap.docs.map((d) => d.data() as UserAccountDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }

  if (isBootstrapAdminUser(adminUser)) {
    for (const u of userDocs) {
      if (
        u.uid !== adminUser.uid &&
        u.role === 'admin' &&
        u.email.trim().toLowerCase() !== BOOTSTRAP_ADMIN_EMAIL
      ) {
        let hasExplicitAdminDoc = false;
        try {
          const adminSnap = await getDoc(doc(db, 'admins', u.uid));
          hasExplicitAdminDoc = adminSnap.exists();
        } catch {
          hasExplicitAdminDoc = false;
        }
        if (!hasExplicitAdminDoc) {
          try {
            await updateDoc(doc(db, 'users', u.uid), {
              role: 'user',
              updatedAt: serverTimestamp(),
            });
            u.role = 'user';
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${u.uid}`);
          }
        }
      }
    }
  }

  let invitationDocs: FamilyInvitationDoc[] = [];
  try {
    const invSnap = await getDocs(collection(db, 'familyInvitations'));
    invitationDocs = invSnap.docs.map((d) => d.data() as FamilyInvitationDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'familyInvitations');
  }

  // Record audit log for metrics read
  const logId = generateSafeId('log');
  try {
    await setDoc(doc(db, 'adminLogs', logId), {
      id: logId,
      numericId: toNumericId(logId),
      adminUid: adminUser.uid,
      adminNumericId: toNumericId(adminUser.uid),
      adminEmail: clamp((adminUser.email || '').toLowerCase(), 254),
      action: 'VIEW_METRICS',
      targetUid: '',
      targetNumericId: 0,
      targetAccountCode: '',
      reason: 'Admin Console Dashboard Load',
      result: 'SUCCESS',
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `adminLogs/${logId}`);
  }

  let logDocs: AdminLogDoc[] = [];
  try {
    const logsSnap = await getDocs(collection(db, 'adminLogs'));
    logDocs = logsSnap.docs.map((d) => d.data() as AdminLogDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'adminLogs');
  }

  let totalPlaces = 0;
  let totalCommunities = 0;
  let totalRelationships = 0;
  let activeTrees = 0;
  const countries = new Set<string>();
  const allEvents: Array<{ id: number; eventType: string; eventDescription: string; createdAt: string; ms: number }> = [];

  for (const u of userDocs.slice(0, 50)) {
    const [placesSnap, commsSnap, famSnap, evtSnap] = await Promise.all([
      getDocs(collection(db, 'users', u.uid, 'places')).catch((e) =>
        handleFirestoreError(e, OperationType.LIST, `users/${u.uid}/places`),
      ),
      getDocs(collection(db, 'users', u.uid, 'communities')).catch((e) =>
        handleFirestoreError(e, OperationType.LIST, `users/${u.uid}/communities`),
      ),
      getDocs(collection(db, 'users', u.uid, 'familyMembers')).catch((e) =>
        handleFirestoreError(e, OperationType.LIST, `users/${u.uid}/familyMembers`),
      ),
      getDocs(collection(db, 'users', u.uid, 'activityEvents')).catch((e) =>
        handleFirestoreError(e, OperationType.LIST, `users/${u.uid}/activityEvents`),
      ),
    ]);

    totalPlaces += placesSnap.size;
    for (const p of placesSnap.docs) {
      const pd = p.data() as PlaceDoc;
      if (pd.country) countries.add(pd.country.trim().toLowerCase());
    }
    totalCommunities += commsSnap.size;
    totalRelationships += famSnap.size;
    if (famSnap.size > 0) activeTrees++;

    for (const ev of evtSnap.docs) {
      const ed = ev.data() as ActivityEventDoc;
      allEvents.push({
        id: ed.numericId,
        eventType: ed.eventType,
        eventDescription: ed.summary,
        createdAt: tsToIso(ed.createdAt),
        ms: tsToMs(ed.createdAt),
      });
    }
  }

  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const now = Date.now();
  const qLower = searchQuery.trim().toLowerCase();
  const filteredUsers = userDocs
    .filter(
      (u) =>
        !qLower ||
        u.email.toLowerCase().includes(qLower) ||
        u.displayName.toLowerCase().includes(qLower),
    )
    .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt))
    .map((u) => ({
      id: u.numericId,
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || null,
      role: u.role,
      status: u.status,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: tsToIso(u.createdAt),
    }));

  const sortedLogs: AdminAccessLogEntry[] = [...logDocs]
    .sort((a, b) => tsToMs(b.timestamp) - tsToMs(a.timestamp))
    .slice(0, 50)
    .map((l) => ({
      id: l.numericId,
      adminUserId: l.adminNumericId,
      adminEmail: l.adminEmail,
      action: l.action,
      targetUserId: l.targetNumericId || null,
      targetAccountCode: l.targetAccountCode || null,
      reason: l.reason,
      result: l.result,
      timestamp: tsToIso(l.timestamp),
    }));

  const avgTreeSize = activeTrees > 0 ? Math.round((totalRelationships / activeTrees) * 10) / 10 : 0;

  return {
    metrics: {
      registeredUsers: userDocs.length,
      activeUsers: userDocs.filter((u) => u.status === 'active').length,
      familiesCount: activeTrees,
      relationshipsCount: totalRelationships,
      activeFamilyTreesCount: activeTrees,
      averageFamilyTreeSize: avgTreeSize,
      activeInvitationsCount: invitationDocs.filter(
        (i) => i.status === 'pending' && tsToMs(i.expiresAt) > now,
      ).length,
      claimedInvitationsCount: invitationDocs.filter((i) => i.status === 'accepted').length,
      communitiesCount: totalCommunities,
      placesCount: totalPlaces,
      countriesRepresented: countries.size,
    },
    health: {
      database: 'healthy',
      dbLatencyMs: latencyMs,
      authService: 'healthy',
      serverUptimeSeconds: Math.floor(performance.now() / 1000),
      recentErrorCount: null,
      timestamp: new Date().toISOString(),
    },
    activity: allEvents
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 40)
      .map(({ id, eventType, eventDescription, createdAt }) => ({
        id,
        eventType,
        eventDescription,
        createdAt,
      })),
    usersList: filteredUsers,
    logs: sortedLogs,
  };
}

export async function adminUpdateUserStatusFs(
  targetUid: string,
  targetNumericId: number,
  status: 'active' | 'suspended',
  reason: string,
): Promise<void> {
  const adminUser = requireVerifiedCurrentUser();
  const userPath = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  const logId = generateSafeId('log');
  try {
    await setDoc(doc(db, 'adminLogs', logId), {
      id: logId,
      numericId: toNumericId(logId),
      adminUid: adminUser.uid,
      adminNumericId: toNumericId(adminUser.uid),
      adminEmail: clamp((adminUser.email || '').toLowerCase(), 254),
      action: status === 'suspended' ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      targetUid: clamp(targetUid, 128),
      targetNumericId,
      targetAccountCode: `GS-${10000 + (targetNumericId % 90000)}`,
      reason: clamp(reason, 400) || 'Administrative status update',
      result: 'SUCCESS',
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `adminLogs/${logId}`);
  }
}
