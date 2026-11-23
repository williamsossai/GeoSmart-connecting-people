import crypto from 'node:crypto';
import type {
  CommunityConnectionType,
  CommunityType,
  PlaceConnectionType,
  RelationshipType,
  VisibilitySetting,
} from '../types.ts';
import { hashPassword, isConfiguredAdminUid, signAppToken, verifyPassword } from '../lib/server-auth.ts';
import { deleteFamilyStoryObject } from '../lib/family-story-storage.ts';

interface MockUser {
  id: number;
  uid: string;
  email: string;
  passwordHash: string | null;
  displayName: string | null;
  role: string;
  status: string;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPerson {
  id: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: string | null;
  birthDate: string | null;
  isLiving: boolean;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockProfile {
  id: number;
  personId: number;
  bio: string | null;
  currentResidenceSummary: string | null;
  originSummary: string | null;
  avatarUrl: string | null;
  visibility: VisibilitySetting;
  updatedAt: Date;
}

interface MockRelationship {
  id: number;
  personAId: number;
  personBId: number;
  relationshipType: string;
  inverseRelationshipType: string | null;
  notes: string | null;
  visibility: VisibilitySetting;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPlace {
  id: number;
  name: string;
  country: string;
  stateRegion: string | null;
  districtLga: string | null;
  townCity: string | null;
  villageLocality: string | null;
  placeType: string;
  latitude: string | null;
  longitude: string | null;
  createdAt: Date;
}

interface MockPersonPlace {
  id: number;
  personId: number;
  placeId: number;
  connectionType: PlaceConnectionType;
  humanLabel: string | null;
  isCurrent: boolean;
  notes: string | null;
  visibility: VisibilitySetting;
  createdByUserId: number;
  createdAt: Date;
}

interface MockCommunity {
  id: number;
  name: string;
  communityType: CommunityType;
  description: string | null;
  associatedPlaceId: number | null;
  visibility: VisibilitySetting;
  createdByUserId: number;
  createdAt: Date;
}

interface MockPersonCommunity {
  id: number;
  personId: number;
  communityId: number;
  connectionType: CommunityConnectionType;
  humanLabel: string | null;
  notes: string | null;
  visibility: VisibilitySetting;
  createdByUserId: number;
  createdAt: Date;
}

interface MockActivityEvent {
  id: number;
  eventType: string;
  userId: number | null;
  targetType: string | null;
  targetId: number | null;
  summary: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

interface MockAdminLog {
  id: number;
  adminUserId: number;
  adminEmail: string;
  action: string;
  targetUserId: number | null;
  targetAccountCode: string | null;
  reason: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  timestamp: Date;
}

interface MockInvitation {
  id: number;
  inviterUserId: number;
  personId: number;
  inviteeEmail: string | null;
  inviteCode: string;
  relationshipType: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedByUserId: number | null;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
}

interface MockNotificationState {
  userId: number;
  alertsEnabled: boolean;
  activityReadAt: Date;
  updatedAt: Date;
}

interface MockFamilyStory {
  id: number;
  ownerUserId: number;
  personId: number;
  title: string;
  description: string | null;
  storagePath: string;
  contentType: string;
  mediaType: 'audio' | 'video';
  fileSize: number;
  visibility: 'private' | 'family';
  consentVersion: string;
  consentConfirmedAt: Date;
  createdAt: Date;
}

const state = {
  seq: 1,
  users: new Map<number, MockUser>(),
  people: new Map<number, MockPerson>(),
  profiles: new Map<number, MockProfile>(),
  relationships: new Map<number, MockRelationship>(),
  places: new Map<number, MockPlace>(),
  personPlaces: new Map<number, MockPersonPlace>(),
  communities: new Map<number, MockCommunity>(),
  personCommunities: new Map<number, MockPersonCommunity>(),
  activityEvents: [] as MockActivityEvent[],
  adminLogs: [] as MockAdminLog[],
  invitations: new Map<number, MockInvitation>(),
  notificationStates: new Map<number, MockNotificationState>(),
  stories: new Map<number, MockFamilyStory>(),
};

const nextId = () => state.seq++;

function getInverseRelationship(type: RelationshipType): RelationshipType {
  switch (type) {
    case 'parent': return 'child';
    case 'child': return 'parent';
    case 'spouse': return 'spouse';
    case 'sibling': return 'sibling';
    case 'grandparent': return 'grandchild';
    case 'grandchild': return 'grandparent';
    case 'relative': return 'relative';
    default: return 'other';
  }
}

function recordActivity(
  eventType: string,
  summary: string,
  userId?: number | null,
  targetType?: string,
  targetId?: number,
  metadata?: any
) {
  state.activityEvents.unshift({
    id: nextId(),
    eventType,
    summary,
    userId: userId ?? null,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    metadata: metadata ? JSON.stringify(metadata) : null,
    ipAddress: null,
    createdAt: new Date(),
  });
}

function ensurePerson(userId: number, email: string, displayName?: string | null): MockPerson {
  for (const person of state.people.values()) {
    if (person.userId === userId) return person;
  }
  const nameParts = (displayName || email.split('@')[0] || 'User').trim().split(' ');
  const firstName = nameParts[0] || 'User';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Member';
  const now = new Date();
  const person: MockPerson = {
    id: nextId(),
    userId,
    firstName,
    lastName,
    otherNames: null,
    gender: null,
    birthDate: null,
    isLiving: true,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
  state.people.set(person.id, person);
  state.profiles.set(person.id, {
    id: nextId(),
    personId: person.id,
    bio: '',
    currentResidenceSummary: null,
    originSummary: null,
    avatarUrl: null,
    visibility: 'private',
    updatedAt: now,
  });
  return person;
}

function requireManageable(userId: number, personId: number): MockPerson {
  const person = state.people.get(personId);
  if (!person) throw new Error('Person record not found.');
  const isOwned = person.userId === userId || (person.createdByUserId === userId && person.userId === null);
  if (!isOwned) throw new Error('You do not have permission to change this person record.');
  return person;
}

export const mockRepo = {
  async getOrCreateUser(uid: string, email: string, displayName?: string | null) {
    for (const u of state.users.values()) {
      if (u.uid === uid) {
        if (isConfiguredAdminUid(uid) && u.role !== 'admin') {
          u.role = 'admin';
          u.updatedAt = new Date();
        }
        if (displayName && u.displayName !== displayName) {
          u.displayName = displayName;
          u.updatedAt = new Date();
        }
        return u;
      }
    }
    const now = new Date();
    const user: MockUser = {
      id: nextId(),
      uid,
      email,
      passwordHash: null,
      displayName: displayName || email.split('@')[0],
      role: isConfiguredAdminUid(uid) ? 'admin' : 'user',
      status: 'active',
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    state.users.set(user.id, user);
    ensurePerson(user.id, email, user.displayName);
    recordActivity('USER_CREATED', `Account created for ${user.email}`, user.id, 'user', user.id);
    return user;
  },

  async getUserOverview(userId: number) {
    const user = state.users.get(userId);
    if (!user) throw new Error('User not found');
    const person = ensurePerson(userId, user.email, user.displayName);
    const profile = state.profiles.get(person.id) || {
      id: 0,
      personId: person.id,
      bio: null,
      currentResidenceSummary: null,
      originSummary: null,
      avatarUrl: null,
      visibility: 'private' as VisibilitySetting,
      updatedAt: new Date(),
    };
    const userPlaceLinks = [...state.personPlaces.values()].filter((p) => p.personId === person.id);
    const countries = new Set(
      userPlaceLinks.map((pp) => state.places.get(pp.placeId)?.country).filter(Boolean)
    );
    const communitiesCount = [...state.personCommunities.values()].filter((c) => c.personId === person.id).length;
    const familyCount = [...state.relationships.values()].filter(
      (r) => r.createdByUserId === userId && (r.personAId === person.id || r.personBId === person.id)
    ).length;

    const recentActivity = state.activityEvents
      .filter((e) => e.userId === userId)
      .slice(0, 5)
      .map((e) => ({ id: e.id, summary: e.summary, createdAt: e.createdAt.toISOString() }));

    const privacyHistory = state.activityEvents
      .filter(
        (e) =>
          e.userId === userId &&
          (e.eventType === 'PROFILE_SHARING_PREFERENCE_UPDATED' ||
            e.eventType === 'PLACE_SHARING_PREFERENCE_UPDATED')
      )
      .slice(0, 5)
      .map((event) => {
        let meta: Record<string, string> = {};
        try {
          meta = event.metadata ? JSON.parse(event.metadata) : {};
        } catch {
          meta = {};
        }
        return {
          id: event.id,
          previous: (meta.previous || 'private') as VisibilitySetting,
          selected: (meta.selected || 'private') as VisibilitySetting,
          scope: (meta.scope === 'place_connection' ? 'Place' : 'Profile') as 'Place' | 'Profile',
          createdAt: event.createdAt.toISOString(),
        };
      });

    return {
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        onboardingCompleted: user.onboardingCompleted,
        createdAt: user.createdAt.toISOString(),
      },
      person: {
        id: person.id,
        userId: person.userId,
        firstName: person.firstName,
        lastName: person.lastName,
        otherNames: person.otherNames,
        gender: person.gender,
        birthDate: person.birthDate,
        isLiving: person.isLiving,
        createdByUserId: person.createdByUserId,
      },
      profile: {
        id: profile.id,
        personId: profile.personId,
        bio: profile.bio,
        currentResidenceSummary: profile.currentResidenceSummary,
        originSummary: profile.originSummary,
        avatarUrl: profile.avatarUrl,
        visibility: profile.visibility,
      },
      stats: {
        countriesCount: countries.size,
        placesCount: userPlaceLinks.length,
        communitiesCount,
        familyCount,
      },
      recentActivity,
      privacyHistory,
    };
  },

  async updateUserProfile(userId: number, data: any) {
    const person = ensurePerson(userId, '');
    const prevProfile = state.profiles.get(person.id);
    if (data.firstName || data.lastName || data.otherNames !== undefined) {
      person.firstName = data.firstName || person.firstName;
      person.lastName = data.lastName || person.lastName;
      if (data.otherNames !== undefined) person.otherNames = data.otherNames;
      person.updatedAt = new Date();
      const user = state.users.get(userId);
      if (user) {
        user.displayName = `${person.firstName} ${person.lastName}`.trim();
      }
    }
    const updated: MockProfile = {
      id: prevProfile?.id || nextId(),
      personId: person.id,
      bio: data.bio !== undefined ? data.bio : prevProfile?.bio ?? null,
      currentResidenceSummary:
        data.currentResidenceSummary !== undefined
          ? data.currentResidenceSummary
          : prevProfile?.currentResidenceSummary ?? null,
      originSummary: data.originSummary !== undefined ? data.originSummary : prevProfile?.originSummary ?? null,
      visibility: data.visibility || prevProfile?.visibility || 'private',
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : prevProfile?.avatarUrl ?? null,
      updatedAt: new Date(),
    };
    state.profiles.set(person.id, updated);
    recordActivity('PROFILE_UPDATED', 'Personal profile information updated', userId, 'profile', updated.id);
    if (data.visibility && prevProfile?.visibility !== data.visibility) {
      recordActivity('PROFILE_SHARING_PREFERENCE_UPDATED', 'Profile sharing preference changed', userId, 'profile', updated.id, {
        scope: 'profile_details_through_family_connections',
        previous: prevProfile?.visibility || 'private',
        selected: data.visibility,
      });
    }
    return updated;
  },

  async completeOnboarding(userId: number) {
    const user = state.users.get(userId);
    if (user) {
      user.onboardingCompleted = true;
      user.updatedAt = new Date();
    }
    recordActivity('ONBOARDING_COMPLETED', 'User completed initial onboarding tour', userId, 'user', userId);
    return { success: true };
  },

  async getUserPlaces(userId: number) {
    const person = ensurePerson(userId, '');
    return [...state.personPlaces.values()]
      .filter((pp) => pp.personId === person.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((pp) => {
        const place = state.places.get(pp.placeId)!;
        return {
          connectionId: pp.id,
          personId: pp.personId,
          connectionType: pp.connectionType,
          humanLabel: pp.humanLabel,
          isCurrent: pp.isCurrent,
          notes: pp.notes,
          visibility: pp.visibility,
          createdAt: pp.createdAt,
          id: place.id,
          name: place.name,
          country: place.country,
          stateRegion: place.stateRegion,
          districtLga: place.districtLga,
          townCity: place.townCity,
          villageLocality: place.villageLocality,
          placeType: place.placeType,
          latitude: place.latitude,
          longitude: place.longitude,
        };
      });
  },

  async addPlaceConnection(userId: number, data: any) {
    const defaultPerson = ensurePerson(userId, '');
    const targetPersonId = data.forPersonId || defaultPerson.id;
    if (targetPersonId !== defaultPerson.id) {
      const target = requireManageable(userId, targetPersonId);
      if (target.isLiving && target.userId === null) {
        throw new Error('Add personal place details after this living relative claims their family record.');
      }
    }
    let place = [...state.places.values()].find(
      (p) =>
        p.name.toLowerCase() === data.name.trim().toLowerCase() &&
        p.country.toLowerCase() === data.country.trim().toLowerCase()
    );
    if (!place) {
      place = {
        id: nextId(),
        name: data.name.trim(),
        country: data.country.trim(),
        stateRegion: data.stateRegion || null,
        districtLga: data.districtLga || null,
        townCity: data.townCity || null,
        villageLocality: data.villageLocality || null,
        placeType: data.placeType || 'town',
        latitude: null,
        longitude: null,
        createdAt: new Date(),
      };
      state.places.set(place.id, place);
    }
    const labelMap: Record<string, string> = {
      residence: 'Where I live',
      origin: "Where I'm from",
      family_ancestral: 'Family/ancestral place',
      birthplace: 'Birthplace',
      work: 'Work location',
      study: 'Study location',
    };
    const humanLabel = data.humanLabel || labelMap[data.connectionType] || 'Connected place';
    const existing = [...state.personPlaces.values()].find(
      (pp) =>
        pp.personId === targetPersonId &&
        pp.placeId === place!.id &&
        pp.connectionType === data.connectionType &&
        pp.createdByUserId === userId
    );
    if (existing) return existing;
    const connection: MockPersonPlace = {
      id: nextId(),
      personId: targetPersonId,
      placeId: place.id,
      connectionType: data.connectionType,
      humanLabel,
      isCurrent: Boolean(data.isCurrent),
      notes: data.notes || null,
      visibility: data.visibility || 'private',
      createdByUserId: userId,
      createdAt: new Date(),
    };
    state.personPlaces.set(connection.id, connection);
    recordActivity('PLACE_ADDED', `Added place connection: ${place.name}, ${place.country} (${humanLabel})`, userId, 'place', place.id);
    return connection;
  },

  async updatePlaceConnection(userId: number, connectionId: number, data: any) {
    const conn = state.personPlaces.get(connectionId);
    if (!conn || conn.createdByUserId !== userId) throw new Error('Place connection not found or permission denied');
    const owner = state.people.get(conn.personId);
    if (owner?.isLiving && owner.userId === null) {
      throw new Error('Personal place details can be edited after this living relative claims their record.');
    }
    const prevVisibility = conn.visibility;
    const place = state.places.get(conn.placeId);
    if (place) {
      place.name = data.name.trim();
      place.country = data.country.trim();
      place.stateRegion = data.stateRegion?.trim() || null;
      place.districtLga = data.districtLga?.trim() || null;
      place.townCity = data.townCity?.trim() || null;
      place.villageLocality = data.villageLocality?.trim() || null;
      place.placeType = data.placeType || 'town';
    }
    conn.connectionType = data.connectionType;
    conn.humanLabel = data.humanLabel?.trim() || null;
    conn.isCurrent = Boolean(data.isCurrent);
    conn.notes = data.notes?.trim() || null;
    conn.visibility = data.visibility || 'private';
    if (data.visibility && data.visibility !== prevVisibility) {
      recordActivity('PLACE_SHARING_PREFERENCE_UPDATED', 'Place sharing preference changed', userId, 'place_connection', conn.id, {
        scope: 'place_connection',
        previous: prevVisibility,
        selected: data.visibility,
      });
    }
    recordActivity('PLACE_UPDATED', `Updated place connection: ${data.name}, ${data.country}`, userId, 'place', conn.placeId);
    return { success: true };
  },

  async removePlaceConnection(userId: number, connectionId: number) {
    const conn = state.personPlaces.get(connectionId);
    if (!conn || conn.createdByUserId !== userId) throw new Error('Connection not found or permission denied');
    state.personPlaces.delete(connectionId);
    recordActivity('PLACE_REMOVED', 'Removed place connection', userId, 'place', conn.placeId);
    return { success: true };
  },

  async getUserCommunities(userId: number) {
    const person = ensurePerson(userId, '');
    return [...state.personCommunities.values()]
      .filter((pc) => pc.personId === person.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((pc) => {
        const comm = state.communities.get(pc.communityId)!;
        const assocPlace = comm.associatedPlaceId ? state.places.get(comm.associatedPlaceId) : null;
        return {
          connectionId: pc.id,
          personId: pc.personId,
          connectionType: pc.connectionType,
          humanLabel: pc.humanLabel,
          notes: pc.notes,
          visibility: 'private' as const,
          createdAt: pc.createdAt,
          id: comm.id,
          name: comm.name,
          communityType: comm.communityType,
          description: comm.description,
          associatedPlaceId: comm.associatedPlaceId,
          associatedPlaceName: assocPlace?.name ?? null,
          associatedPlaceCountry: assocPlace?.country ?? null,
        };
      });
  },

  async addCommunityConnection(userId: number, data: any) {
    const person = ensurePerson(userId, '');
    let comm = [...state.communities.values()].find(
      (c) => c.name.toLowerCase() === data.name.trim().toLowerCase()
    );
    if (!comm) {
      comm = {
        id: nextId(),
        name: data.name.trim(),
        communityType: data.communityType || 'hometown',
        description: data.description || null,
        associatedPlaceId: data.associatedPlaceId || null,
        visibility: 'private',
        createdByUserId: userId,
        createdAt: new Date(),
      };
      state.communities.set(comm.id, comm);
    }
    const labelMap: Record<string, string> = {
      resident: 'Resident',
      member: 'Member',
      origin: 'Community of Origin',
      ancestral_connection: 'Ancestral Connection',
      family_connection: 'Family Connection',
      marriage_connection: 'Marriage Connection',
      professional: 'Professional Association',
    };
    const humanLabel = data.humanLabel || labelMap[data.connectionType] || 'Community Connection';
    const existing = [...state.personCommunities.values()].find(
      (pc) =>
        pc.personId === person.id &&
        pc.communityId === comm!.id &&
        pc.connectionType === data.connectionType &&
        pc.createdByUserId === userId
    );
    if (existing) return existing;
    const conn: MockPersonCommunity = {
      id: nextId(),
      personId: person.id,
      communityId: comm.id,
      connectionType: data.connectionType,
      humanLabel,
      notes: data.notes || null,
      visibility: 'private',
      createdByUserId: userId,
      createdAt: new Date(),
    };
    state.personCommunities.set(conn.id, conn);
    recordActivity('COMMUNITY_ADDED', `Connected to community: ${comm.name} (${humanLabel})`, userId, 'community', comm.id);
    return conn;
  },

  async removeCommunityConnection(userId: number, connectionId: number) {
    const conn = state.personCommunities.get(connectionId);
    if (!conn || conn.createdByUserId !== userId) throw new Error('Community connection not found or permission denied');
    state.personCommunities.delete(connectionId);
    recordActivity('COMMUNITY_REMOVED', 'Removed community connection', userId, 'community', conn.communityId);
    return { success: true };
  },

  async getUserFamily(userId: number) {
    const userPerson = ensurePerson(userId, '');
    const rels = [...state.relationships.values()]
      .filter(
        (r) => r.createdByUserId === userId && (r.personAId === userPerson.id || r.personBId === userPerson.id)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return rels
      .map((rel) => {
        const otherId = rel.personAId === userPerson.id ? rel.personBId : rel.personAId;
        const other = state.people.get(otherId);
        if (!other) return null;
        const displayedType = (rel.personAId === userPerson.id
          ? rel.relationshipType
          : rel.inverseRelationshipType || getInverseRelationship(rel.relationshipType as RelationshipType)) as RelationshipType;
        const profile = state.profiles.get(other.id);
        const isAnotherAccount = Boolean(other.userId && other.userId !== userId);
        const hasClaimedLiving = !other.isLiving || Boolean(other.userId);
        const canView = hasClaimedLiving && (!isAnotherAccount || profile?.visibility === 'shared' || profile?.visibility === 'public');
        const visiblePlaces = [...state.personPlaces.values()].filter((pp) => {
          if (pp.personId !== other.id) return false;
          if (isAnotherAccount) return pp.visibility === 'shared' || pp.visibility === 'public';
          return true;
        });
        const originPlace = visiblePlaces.find((pp) =>
          ['origin', 'birthplace', 'residence'].includes(pp.connectionType)
        );
        const placeObj = originPlace ? state.places.get(originPlace.placeId) : null;
        const linkedUser = other.userId && canView ? state.users.get(other.userId) : null;

        return {
          relationshipId: rel.id,
          personId: other.id,
          firstName: other.firstName,
          lastName: other.lastName,
          otherNames: canView ? other.otherNames : null,
          gender: canView ? other.gender : null,
          birthDate: canView ? other.birthDate : null,
          isLiving: other.isLiving,
          relationshipType: displayedType,
          inverseRelationshipType: rel.inverseRelationshipType,
          notes: canView ? rel.notes : null,
          placesCount: hasClaimedLiving ? visiblePlaces.length : 0,
          userId: other.userId,
          hasAccount: Boolean(other.userId),
          userEmail: null,
          userDisplayName: linkedUser?.displayName || null,
          visibility: profile?.visibility || 'private',
          originSummary: canView ? profile?.originSummary || null : null,
          currentResidenceSummary: canView ? profile?.currentResidenceSummary || null : null,
          placeOfOrigin: canView && placeObj ? { name: placeObj.name, country: placeObj.country } : null,
        };
      })
      .filter(Boolean);
  },

  async getUserFamilyTree(userId: number) {
    const userPerson = ensurePerson(userId, '');
    const userProfile = state.profiles.get(userPerson.id);
    const currentUser = state.users.get(userId);
    const selfPlaceLink = [...state.personPlaces.values()].find(
      (pp) => pp.personId === userPerson.id && (pp.connectionType === 'origin' || pp.connectionType === 'birthplace')
    );
    const selfPlace = selfPlaceLink ? state.places.get(selfPlaceLink.placeId) : null;
    const selfOrigin = selfPlace ? `${selfPlace.name}, ${selfPlace.country}` : userProfile?.originSummary || null;

    const selfNode = {
      personId: userPerson.id,
      firstName: userPerson.firstName,
      lastName: userPerson.lastName,
      otherNames: userPerson.otherNames,
      gender: userPerson.gender,
      relationshipType: 'self' as const,
      generation: 0,
      generationLabel: 'You',
      isSelf: true,
      isLiving: userPerson.isLiving,
      hasAccount: true,
      userId,
      userEmail: currentUser?.email || null,
      userDisplayName: currentUser?.displayName || null,
      notes: null,
      placeOfOrigin: selfOrigin,
      placesCount: 0,
      visibility: userProfile?.visibility || 'private',
    };

    const members = (await mockRepo.getUserFamily(userId)) as any[];
    const nodes: any[] = [selfNode];
    const generations: Record<number, any[]> = { 2: [], 1: [], 0: [selfNode], [-1]: [], [-2]: [], 3: [] };
    const placeMap = new Map<string, { name: string; country: string }>();
    if (selfPlace) placeMap.set(`${selfPlace.name}-${selfPlace.country}`, { name: selfPlace.name, country: selfPlace.country });
    let membersWithAccounts = 1;

    for (const m of members) {
      let generation = 3;
      let generationLabel = 'Extended Family';
      switch (m.relationshipType) {
        case 'grandparent': generation = 2; generationLabel = 'Grandparents'; break;
        case 'parent': generation = 1; generationLabel = 'Parents'; break;
        case 'spouse': generation = 0; generationLabel = 'Spouses & Partners'; break;
        case 'sibling': generation = 0; generationLabel = 'Siblings'; break;
        case 'child': generation = -1; generationLabel = 'Children'; break;
        case 'grandchild': generation = -2; generationLabel = 'Grandchildren'; break;
      }
      const placeStr = m.placeOfOrigin ? `${m.placeOfOrigin.name}, ${m.placeOfOrigin.country}` : m.originSummary || null;
      if (m.placeOfOrigin) placeMap.set(`${m.placeOfOrigin.name}-${m.placeOfOrigin.country}`, m.placeOfOrigin);
      if (m.hasAccount) membersWithAccounts++;
      const node = {
        personId: m.personId,
        relationshipId: m.relationshipId,
        firstName: m.firstName,
        lastName: m.lastName,
        otherNames: m.otherNames,
        gender: m.gender,
        relationshipType: m.relationshipType,
        generation,
        generationLabel,
        isSelf: false,
        isLiving: m.isLiving,
        hasAccount: Boolean(m.hasAccount),
        userId: m.userId,
        userEmail: m.userEmail,
        userDisplayName: m.userDisplayName,
        notes: m.notes,
        placeOfOrigin: placeStr,
        placesCount: m.placesCount,
        visibility: m.visibility,
      };
      nodes.push(node);
      generations[generation] ??= [];
      generations[generation].push(node);
    }

    return {
      self: selfNode,
      nodes,
      generations,
      summary: {
        totalMembers: nodes.length,
        generationsCount: Object.values(generations).filter((l) => l.length > 0).length,
        membersWithAccounts,
        placesCount: placeMap.size,
        placesList: [...placeMap.values()],
      },
    };
  },

  async addFamilyMember(userId: number, data: any) {
    const supportedGenders = ['female', 'male', 'non_binary', 'another', 'unspecified'];
    if (data.gender && !supportedGenders.includes(data.gender)) throw new Error('Choose a supported gender option.');
    const userPerson = ensurePerson(userId, '');
    if (data.connectExistingUserId || data.connectUserEmail?.trim()) {
      throw new Error('A registered account can only be linked after its owner accepts a family invitation.');
    }
    if (data.existingPersonId && data.existingPersonId === userPerson.id) {
      throw new Error('A person cannot have a family relationship with themselves.');
    }
    let familyPerson: MockPerson;
    if (data.existingPersonId) {
      familyPerson = requireManageable(userId, data.existingPersonId);
      if (familyPerson.userId !== null) throw new Error('That person is already linked to an account. Use a family invitation instead.');
    } else {
      const now = new Date();
      familyPerson = {
        id: nextId(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        otherNames: data.isLiving === false ? data.otherNames || null : null,
        gender: data.gender && data.gender !== 'unspecified' ? data.gender : null,
        birthDate: data.isLiving === false ? data.birthDate || null : null,
        isLiving: data.isLiving !== undefined ? Boolean(data.isLiving) : true,
        createdByUserId: userId,
        userId: null,
        createdAt: now,
        updatedAt: now,
      };
      state.people.set(familyPerson.id, familyPerson);
      state.profiles.set(familyPerson.id, {
        id: nextId(),
        personId: familyPerson.id,
        bio: null,
        currentResidenceSummary: null,
        originSummary: null,
        avatarUrl: null,
        visibility: data.visibility || 'private',
        updatedAt: now,
      });
    }
    const canStoreUnclaimed = familyPerson.isLiving === false && familyPerson.userId === null;
    const now = new Date();
    const relationship: MockRelationship = {
      id: nextId(),
      personAId: userPerson.id,
      personBId: familyPerson.id,
      relationshipType: data.relationshipType,
      inverseRelationshipType: getInverseRelationship(data.relationshipType),
      notes: canStoreUnclaimed ? data.notes || null : null,
      visibility: data.visibility || 'private',
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    };
    state.relationships.set(relationship.id, relationship);
    if (canStoreUnclaimed && data.placeOfOrigin?.name && data.placeOfOrigin?.country) {
      await mockRepo.addPlaceConnection(userId, {
        ...data.placeOfOrigin,
        connectionType: 'origin',
        humanLabel: "Where they're from",
        forPersonId: familyPerson.id,
      });
    }
    recordActivity('FAMILY_MEMBER_ADDED', `Added family connection: ${data.firstName} ${data.lastName} (${data.relationshipType})`, userId, 'person', familyPerson.id);
    recordActivity('RELATIONSHIP_CREATED', `Created relationship (${data.relationshipType}) with ${data.firstName} ${data.lastName}`, userId, 'relationship', relationship.id);
    return { relationship, familyPerson };
  },

  async updateFamilyRelationship(userId: number, relationshipId: number, data: any) {
    const rel = state.relationships.get(relationshipId);
    if (!rel || rel.createdByUserId !== userId) throw new Error('Relationship not found or permission denied');
    const userPerson = ensurePerson(userId, '');
    const relativeId = rel.personAId === userPerson.id ? rel.personBId : rel.personAId;
    const relative = state.people.get(relativeId);
    if (!relative) throw new Error('Family member record not found.');
    if (data.notes?.trim() && relative.isLiving && relative.userId === null) {
      throw new Error('Relationship notes can be added after this living relative claims their family record.');
    }
    if (data.notes !== undefined) rel.notes = data.notes;
    if (data.visibility !== undefined) rel.visibility = data.visibility;
    if (data.relationshipType) {
      rel.relationshipType = data.relationshipType;
      rel.inverseRelationshipType = getInverseRelationship(data.relationshipType);
    }
    if (data.gender !== undefined) {
      if (relative.userId !== null || relative.createdByUserId !== userId) {
        throw new Error('Only an unclaimed family profile you created can have its gender changed here.');
      }
      relative.gender = data.gender === 'unspecified' ? null : data.gender;
    }
    rel.updatedAt = new Date();
    recordActivity('RELATIONSHIP_UPDATED', `Updated relationship #${relationshipId}`, userId, 'relationship', relationshipId);
    return rel;
  },

  async removeRelationship(userId: number, relationshipIdOrPersonId: number) {
    const userPerson = ensurePerson(userId, '');
    let rel = state.relationships.get(relationshipIdOrPersonId);
    if (!rel) {
      rel = [...state.relationships.values()].find(
        (r) =>
          (r.personAId === userPerson.id && r.personBId === relationshipIdOrPersonId) ||
          (r.personBId === userPerson.id && r.personAId === relationshipIdOrPersonId)
      );
    }
    if (!rel) throw new Error('Relationship not found or permission denied');
    state.relationships.delete(rel.id);
    recordActivity('RELATIONSHIP_REMOVED', 'Removed family connection', userId, 'relationship', rel.id);
    return { success: true };
  },

  async createFamilyInvitation(userId: number, data: { personId: number; inviteeEmail: string; relationshipType: string }) {
    const person = requireManageable(userId, data.personId);
    if (person.createdByUserId !== userId || person.userId !== null) {
      throw new Error('Only an unclaimed family record you created can be invited.');
    }
    const inviteeEmail = data.inviteeEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail) || inviteeEmail.length > 254) {
      throw new Error('Enter a valid email address for the invited relative.');
    }
    const inviteCode = crypto.randomBytes(32).toString('base64url');
    const inviteHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
    const now = new Date();
    const inv: MockInvitation = {
      id: nextId(),
      inviterUserId: userId,
      personId: data.personId,
      inviteeEmail,
      inviteCode: inviteHash,
      relationshipType: data.relationshipType,
      status: 'pending',
      acceptedByUserId: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: now,
      acceptedAt: null,
    };
    state.invitations.set(inv.id, inv);
    recordActivity('FAMILY_INVITATION_CREATED', `Created family invitation for ${person.firstName} ${person.lastName}`, userId, 'person', person.id);
    return { ...inv, inviteCode, personName: `${person.firstName} ${person.lastName}`.trim() };
  },

  async getFamilyInvitations(userId: number) {
    return [...state.invitations.values()]
      .filter((i) => i.inviterUserId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((inv) => {
        const person = state.people.get(inv.personId);
        return {
          id: inv.id,
          inviterUserId: inv.inviterUserId,
          personId: inv.personId,
          personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Family member',
          inviteeEmail: inv.inviteeEmail,
          inviteCode: null,
          relationshipType: inv.relationshipType,
          gender: person?.gender ?? null,
          status: inv.status,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
          acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
        };
      });
  },

  async getFamilyInvitationNotificationState(userId: number, verifiedEmail?: string | null) {
    let notif = state.notificationStates.get(userId);
    if (!notif) {
      notif = { userId, alertsEnabled: true, activityReadAt: new Date(), updatedAt: new Date() };
      state.notificationStates.set(userId, notif);
    }
    const normalizedEmail = verifiedEmail?.trim().toLowerCase();
    const now = new Date();
    const all = [...state.invitations.values()];
    const pendingCount = all.filter(
      (i) =>
        i.status === 'pending' &&
        i.expiresAt > now &&
        (i.inviterUserId === userId || (normalizedEmail && i.inviteeEmail === normalizedEmail && i.inviterUserId !== userId))
    ).length;
    const hasUnreadActivity = all.some(
      (i) =>
        (i.inviterUserId === userId && i.status === 'accepted' && i.acceptedAt && i.acceptedAt > notif!.activityReadAt) ||
        (normalizedEmail && i.inviteeEmail === normalizedEmail && i.inviterUserId !== userId && i.status === 'pending' && i.expiresAt > now && i.createdAt > notif!.activityReadAt)
    );
    return { pendingCount, hasUnreadActivity, alertsEnabled: notif.alertsEnabled };
  },

  async markFamilyInvitationActivityRead(userId: number) {
    const existing = state.notificationStates.get(userId);
    state.notificationStates.set(userId, {
      userId,
      alertsEnabled: existing?.alertsEnabled ?? true,
      activityReadAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async setFamilyInvitationAlertsEnabled(userId: number, alertsEnabled: boolean) {
    const existing = state.notificationStates.get(userId);
    state.notificationStates.set(userId, {
      userId,
      alertsEnabled,
      activityReadAt: existing?.activityReadAt ?? new Date(),
      updatedAt: new Date(),
    });
  },

  async acceptFamilyInvitation(userId: number, inviteCode: string, verifiedEmail?: string | null) {
    const cleanCode = inviteCode.trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(cleanCode)) throw new Error('Invalid or expired invitation code.');
    if (!verifiedEmail) throw new Error('Sign in with a verified email account to accept this invitation.');
    const inviteHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const inv = [...state.invitations.values()].find(
      (i) => i.status === 'pending' && (i.inviteCode === inviteHash || i.inviteCode === cleanCode.toUpperCase())
    );
    if (!inv || inv.inviteeEmail !== verifiedEmail.trim().toLowerCase()) throw new Error('Invalid or expired invitation code.');
    if (new Date() > inv.expiresAt) throw new Error('This invitation has expired.');
    const person = state.people.get(inv.personId);
    if (!person || person.userId !== null) throw new Error('This family record is no longer available to claim.');
    person.userId = userId;
    inv.status = 'accepted';
    inv.acceptedByUserId = userId;
    inv.acceptedAt = new Date();
    return { success: true, personId: person.id };
  },

  async connectRegisteredUserToPerson(userId: number, data: { personId: number; targetEmailOrCode: string }) {
    const input = data.targetEmailOrCode.trim();
    if (input.includes('@')) throw new Error('The account owner must accept a verified-email invitation before linking.');
    const codeHash = crypto.createHash('sha256').update(input).digest('hex');
    const inv = [...state.invitations.values()].find(
      (i) =>
        i.inviterUserId === userId &&
        i.personId === data.personId &&
        i.status === 'accepted' &&
        (i.inviteCode === codeHash || i.inviteCode === input.toUpperCase())
    );
    if (!inv?.acceptedByUserId) throw new Error('The relative must accept your invitation first.');
    const linkedUser = state.users.get(inv.acceptedByUserId);
    if (!linkedUser) throw new Error('The accepted account could not be found.');
    return {
      success: true,
      personId: data.personId,
      linkedUser: { id: linkedUser.id, email: linkedUser.email, displayName: linkedUser.displayName },
    };
  },

  async getKinshipDiscoverySuggestions(userId: number, verifiedEmail?: string | null) {
    const currentUser = state.users.get(userId);
    const normalizedEmail = verifiedEmail?.trim().toLowerCase();
    if (!currentUser?.email || !normalizedEmail || currentUser.email.trim().toLowerCase() !== normalizedEmail) return [];
    const now = new Date();
    return [...state.invitations.values()]
      .filter((i) => i.status === 'pending' && i.expiresAt > now && i.inviteeEmail?.toLowerCase() === normalizedEmail)
      .map((i) => {
        const person = state.people.get(i.personId);
        const inviter = state.users.get(i.inviterUserId);
        return {
          invitationId: i.id,
          personId: i.personId,
          discoveredByUserId: i.inviterUserId,
          discoveredByName: inviter?.displayName || 'A GeoSmart member',
          suggestedRelationship: i.relationshipType,
          suggestedGender: person?.gender ?? null,
          personName: person ? `${person.firstName} ${person.lastName}`.trim() : 'Family member',
          matchReason: 'A family invitation was sent to your verified email address.',
          totalFamilyInNetwork: [...state.relationships.values()].filter((r) => r.createdByUserId === i.inviterUserId).length,
        };
      });
  },

  async claimDiscoveredPerson(userId: number, invitationId: number, verifiedEmail?: string | null) {
    if (!verifiedEmail) throw new Error('Sign in with a verified email account to accept this invitation.');
    const inv = state.invitations.get(invitationId);
    if (!inv || inv.status !== 'pending' || inv.inviteeEmail?.toLowerCase() !== verifiedEmail.trim().toLowerCase() || new Date() > inv.expiresAt) {
      throw new Error('Invitation not found or expired.');
    }
    const person = state.people.get(inv.personId);
    if (!person || person.userId !== null) throw new Error('This family record is no longer available to claim.');
    person.userId = userId;
    inv.status = 'accepted';
    inv.acceptedByUserId = userId;
    inv.acceptedAt = new Date();
    return { success: true, personId: person.id };
  },

  async getFamilyStories(userId: number) {
    const family = (await mockRepo.getUserFamily(userId)) as any[];
    const connectedIds = new Set(family.map((m) => m.userId).filter(Boolean));
    return [...state.stories.values()]
      .filter((s) => s.ownerUserId === userId || (s.visibility === 'family' && connectedIds.has(s.ownerUserId)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((s) => ({
        id: s.id,
        ownerUserId: s.ownerUserId,
        ownerName: state.users.get(s.ownerUserId)?.displayName || 'Family member',
        title: s.title,
        description: s.description,
        mediaType: s.mediaType,
        contentType: s.contentType,
        fileSize: s.fileSize,
        visibility: s.visibility,
        createdAt: s.createdAt.toISOString(),
        isOwner: s.ownerUserId === userId,
      }));
  },

  async createFamilyStory(userId: number, input: any) {
    const person = ensurePerson(userId, '');
    const story: MockFamilyStory = {
      id: nextId(),
      ownerUserId: userId,
      personId: person.id,
      title: input.title,
      description: input.description || null,
      storagePath: input.storagePath,
      contentType: input.contentType,
      mediaType: input.mediaType,
      fileSize: input.fileSize,
      visibility: input.visibility,
      consentVersion: input.consentVersion,
      consentConfirmedAt: new Date(),
      createdAt: new Date(),
    };
    state.stories.set(story.id, story);
    return { id: story.id };
  },

  async getFamilyStoryStoragePath(userId: number, storyId: number) {
    const story = state.stories.get(storyId);
    if (!story) throw new Error('Story not found.');
    if (story.ownerUserId === userId) return story.storagePath;
    if (story.visibility !== 'family') throw new Error('You do not have access to this story.');
    const family = (await mockRepo.getUserFamily(userId)) as any[];
    const connectedIds = new Set(family.map((m) => m.userId).filter(Boolean));
    if (!connectedIds.has(story.ownerUserId)) throw new Error('You do not have access to this story.');
    return story.storagePath;
  },

  async deleteFamilyStory(userId: number, storyId: number) {
    const story = state.stories.get(storyId);
    if (!story || story.ownerUserId !== userId) throw new Error('Story not found or permission denied.');
    await deleteFamilyStoryObject(story.storagePath);
    state.stories.delete(storyId);
    return { success: true };
  },

  async exportUserData(userId: number) {
    const user = state.users.get(userId);
    if (!user) throw new Error('User not found');
    const person = ensurePerson(userId, user.email);
    const profile = state.profiles.get(person.id);
    return {
      product: 'GeoSmart',
      version: 'Phase 1 - Individual Relationship Foundation',
      exportTimestamp: new Date().toISOString(),
      user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
      person,
      profile,
      family: await mockRepo.getUserFamily(userId),
      places: await mockRepo.getUserPlaces(userId),
      communities: await mockRepo.getUserCommunities(userId),
      familyStories: [...state.stories.values()].filter((s) => s.ownerUserId === userId),
      activityLog: state.activityEvents.filter((e) => e.userId === userId),
    };
  },

  async deleteUserAccount(userId: number) {
    state.users.delete(userId);
    return { success: true };
  },

  async getAdminMetrics(adminUserId: number, reason: string) {
    const admin = state.users.get(adminUserId);
    if (!admin || admin.role !== 'admin') throw new Error('Unauthorized administrative access');
    state.adminLogs.unshift({
      id: nextId(),
      adminUserId,
      adminEmail: admin.email,
      action: 'VIEW_METRICS',
      reason: reason || 'System overview dashboard check',
      result: 'SUCCESS',
      targetUserId: null,
      targetAccountCode: null,
      timestamp: new Date(),
    });
    const activeTrees = new Set([...state.relationships.values()].map((r) => r.createdByUserId)).size;
    const totalRels = state.relationships.size;
    return {
      registeredUsers: state.users.size,
      activeUsers: [...state.users.values()].filter((u) => u.status === 'active').length,
      familiesCount: 0,
      relationshipsCount: totalRels,
      activeFamilyTreesCount: activeTrees,
      averageFamilyTreeSize: activeTrees > 0 ? Math.round((totalRels / activeTrees) * 10) / 10 : 0,
      activeInvitationsCount: [...state.invitations.values()].filter((i) => i.status === 'pending').length,
      claimedInvitationsCount: [...state.invitations.values()].filter((i) => i.status === 'accepted').length,
      communitiesCount: state.communities.size,
      placesCount: state.places.size,
      countriesRepresented: new Set([...state.places.values()].map((p) => p.country)).size,
    };
  },

  async getAdminRecentActivity(limit = 20) {
    return state.activityEvents.slice(0, limit);
  },

  async getAdminUsersList(searchQuery?: string) {
    const q = searchQuery?.trim().toLowerCase();
    return [...state.users.values()]
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
      .slice(0, 50);
  },

  async adminUpdateUserStatus(adminUserId: number, targetUserId: number, status: 'active' | 'suspended', reason: string) {
    const admin = state.users.get(adminUserId);
    if (!admin || admin.role !== 'admin') throw new Error('Unauthorized administrative access');
    const target = state.users.get(targetUserId);
    if (!target) throw new Error('Target user not found');
    target.status = status;
    target.updatedAt = new Date();
    state.adminLogs.unshift({
      id: nextId(),
      adminUserId,
      adminEmail: admin.email,
      action: status === 'suspended' ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      reason,
      result: 'SUCCESS',
      targetUserId,
      targetAccountCode: `GS-${10000 + targetUserId}`,
      timestamp: new Date(),
    });
    return { success: true, status };
  },

  async getAdminLogs(limit = 50) {
    return state.adminLogs.slice(0, limit);
  },

  async seedDemoScenario(userId: number, scenario: 'local' | 'diaspora' | 'international' | 'multigen') {
    const userPerson = ensurePerson(userId, '');
    if (scenario === 'local') {
      await mockRepo.addPlaceConnection(userId, { name: 'Lagos', country: 'Nigeria', connectionType: 'residence', humanLabel: 'Where I live', isCurrent: true });
      await mockRepo.addPlaceConnection(userId, { name: 'Ibadan', country: 'Nigeria', connectionType: 'origin', humanLabel: "Where I'm from" });
      await mockRepo.addCommunityConnection(userId, { name: 'Ibadan Descendants Union', communityType: 'cultural_association', connectionType: 'origin', humanLabel: 'Hometown Association' });
      await mockRepo.addFamilyMember(userId, { firstName: 'Ade', lastName: userPerson.lastName, relationshipType: 'sibling', gender: 'male' });
    } else if (scenario === 'diaspora') {
      await mockRepo.addPlaceConnection(userId, { name: 'London', country: 'United Kingdom', connectionType: 'residence', humanLabel: 'Where I live', isCurrent: true });
      await mockRepo.addPlaceConnection(userId, { name: 'Enugu', country: 'Nigeria', connectionType: 'origin', humanLabel: "Where I'm from" });
      await mockRepo.addCommunityConnection(userId, { name: 'Enugu State Association UK', communityType: 'diaspora', connectionType: 'member', humanLabel: 'UK Diaspora Chapter' });
      await mockRepo.addFamilyMember(userId, { firstName: 'Ngozi', lastName: userPerson.lastName, relationshipType: 'parent', gender: 'female' });
    } else if (scenario === 'international') {
      await mockRepo.addPlaceConnection(userId, { name: 'Manchester', country: 'United Kingdom', connectionType: 'residence', humanLabel: 'Where I live', isCurrent: true });
      await mockRepo.addPlaceConnection(userId, { name: 'Benin City', country: 'Nigeria', connectionType: 'origin', humanLabel: "Where I'm from" });
      await mockRepo.addFamilyMember(userId, { firstName: 'Akosua', lastName: 'Mensah', relationshipType: 'spouse', gender: 'female' });
      await mockRepo.addFamilyMember(userId, { firstName: 'David', lastName: userPerson.lastName, relationshipType: 'child', gender: 'male' });
    } else if (scenario === 'multigen') {
      await mockRepo.addFamilyMember(userId, { firstName: 'Ezekiel', lastName: userPerson.lastName, relationshipType: 'grandparent', gender: 'male', isLiving: false });
      await mockRepo.addFamilyMember(userId, { firstName: 'Samuel', lastName: userPerson.lastName, relationshipType: 'parent', gender: 'male', isLiving: true });
      await mockRepo.addFamilyMember(userId, { firstName: 'Maya', lastName: userPerson.lastName, relationshipType: 'child', gender: 'female', isLiving: true });
      await mockRepo.addPlaceConnection(userId, { name: 'Edinburgh', country: 'United Kingdom', connectionType: 'residence', humanLabel: 'Where I live', isCurrent: true });
    }
    return { success: true };
  },

  async registerWithPassword(email: string, password: string, displayName?: string | null) {
    const normalizedEmail = email.trim().toLowerCase();
    for (const u of state.users.values()) {
      if (u.email.toLowerCase() === normalizedEmail) throw new Error('An account with this email already exists.');
    }
    const uid = 'usr_' + crypto.randomUUID().replace(/-/g, '');
    const now = new Date();
    const newUser: MockUser = {
      id: nextId(),
      uid,
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      displayName: displayName || normalizedEmail.split('@')[0],
      role: 'user',
      status: 'active',
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    state.users.set(newUser.id, newUser);
    ensurePerson(newUser.id, newUser.email, newUser.displayName);
    const token = signAppToken({ uid: newUser.uid, email: newUser.email, name: newUser.displayName });
    return {
      user: {
        id: newUser.id,
        uid: newUser.uid,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        status: newUser.status,
        onboardingCompleted: newUser.onboardingCompleted,
      },
      token,
    };
  },

  async loginWithPassword(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = [...state.users.values()].find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user) throw new Error('Invalid email or password.');
    if (!user.passwordHash) {
      throw new Error('This account was registered using Google Sign-In. Please click "Continue with Google".');
    }
    if (user.status === 'suspended') throw new Error('Account suspended. Please contact platform support.');
    if (!verifyPassword(password, user.passwordHash)) throw new Error('Invalid email or password.');
    const token = signAppToken({ uid: user.uid, email: user.email, name: user.displayName });
    return {
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        onboardingCompleted: user.onboardingCompleted,
      },
      token,
    };
  },
};
