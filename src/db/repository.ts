import crypto from 'node:crypto';
import { db } from './index.ts';
import {
  users,
  people,
  profiles,
  personRelationships,
  families,
  familyMembers,
  familyGroupInvitations,
  familyGroupPosts,
  familyGroupComments,
  places,
  personPlaces,
  communities,
  personCommunities,
  activityEvents,
  adminAccessLogs,
  familyInvitations,
  familyInvitationNotificationStates,
  familyStories,
} from './schema.ts';
import { eq, and, or, ilike, desc, sql, isNull, gt, ne, inArray } from 'drizzle-orm';
import type { RelationshipType, PlaceConnectionType, CommunityType, CommunityConnectionType, VisibilitySetting } from '../types.ts';
import { hashPassword, verifyPassword, signAppToken, isConfiguredAdminUid } from '../lib/server-auth.ts';
import { deleteFamilyStoryObject } from '../lib/family-story-storage.ts';

// Helper to compute inverse relationship
export function getInverseRelationship(type: RelationshipType, gender?: string | null): RelationshipType {
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

async function requireManageablePerson(userId: number, personId: number) {
  const [person] = await db
    .select()
    .from(people)
    .where(eq(people.id, personId));
  if (!person) throw new Error('Person record not found.');
  const isOwned = person.userId === userId || (person.createdByUserId === userId && person.userId === null);
  if (!isOwned) throw new Error('You do not have permission to change this person record.');
  return person;
}

// 1. Get or create user record from Firebase Auth
export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.uid, uid));
    if (existing.length > 0) {
      if (isConfiguredAdminUid(uid) && existing[0].role !== 'admin') {
        const [promoted] = await db
          .update(users)
          .set({ role: 'admin', updatedAt: new Date() })
          .where(eq(users.id, existing[0].id))
          .returning();
        return promoted;
      }
      // Update display name if changed
      if (displayName && existing[0].displayName !== displayName) {
        const updated = await db
          .update(users)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(users.id, existing[0].id))
          .returning();
        return updated[0];
      }
      return existing[0];
    }

    // Administrator access is granted only to explicitly provisioned identities.
    const role = isConfiguredAdminUid(uid) ? 'admin' : 'user';

    const [newUser] = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        role,
        status: 'active',
        onboardingCompleted: false,
      })
      .returning();

    // Automatically create primary person & profile record
    const nameParts = (displayName || email.split('@')[0]).trim().split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Member';

    const [person] = await db
      .insert(people)
      .values({
        userId: newUser.id,
        firstName,
        lastName,
        createdByUserId: newUser.id,
      })
      .returning();

    await db.insert(profiles).values({
      personId: person.id,
      bio: '',
      visibility: 'private',
    });

    // Record Event
    await recordActivityEvent(
      'USER_CREATED',
      `Account created for ${newUser.email}`,
      newUser.id,
      'user',
      newUser.id
    );

    return newUser;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account. Please try again.', { cause: error });
  }
}

// 2. Fetch or initialize person for a user
export async function ensureUserPerson(userId: number, email: string, displayName?: string | null) {
  try {
    const existingPerson = await db.select().from(people).where(eq(people.userId, userId));
    if (existingPerson.length > 0) {
      return existingPerson[0];
    }

    const nameParts = (displayName || email.split('@')[0]).trim().split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Member';

    const [person] = await db
      .insert(people)
      .values({
        userId,
        firstName,
        lastName,
        createdByUserId: userId,
      })
      .returning();

    // Ensure profile
    await db
      .insert(profiles)
      .values({
        personId: person.id,
        visibility: 'private',
      })
      .onConflictDoNothing();

    return person;
  } catch (error) {
    console.error('Database error in ensureUserPerson:', error);
    throw new Error('Failed to retrieve user identity record.', { cause: error });
  }
}

async function mergeClaimedPersonIntoAccount(
  tx: any,
  userId: number,
  invitedPerson: typeof people.$inferSelect,
  accountPerson: typeof people.$inferSelect,
  invitationId: number,
) {
  if (invitedPerson.id === accountPerson.id) return invitedPerson.id;

  // Keep the person ID already used by the inviter's tree, but move the account's
  // own profile and connections onto it so the new owner's privacy setting applies.
  await tx.delete(profiles).where(eq(profiles.personId, invitedPerson.id));
  await tx.update(profiles)
    .set({ personId: invitedPerson.id, updatedAt: new Date() })
    .where(eq(profiles.personId, accountPerson.id));
  await tx.update(personRelationships).set({ personAId: invitedPerson.id }).where(eq(personRelationships.personAId, accountPerson.id));
  await tx.update(personRelationships).set({ personBId: invitedPerson.id }).where(eq(personRelationships.personBId, accountPerson.id));
  await tx.update(personPlaces).set({ personId: invitedPerson.id }).where(eq(personPlaces.personId, accountPerson.id));
  await tx.update(personCommunities).set({ personId: invitedPerson.id }).where(eq(personCommunities.personId, accountPerson.id));
  await tx.update(familyMembers).set({ personId: invitedPerson.id }).where(eq(familyMembers.personId, accountPerson.id));
  // Transfer details previously entered by relatives to the claimant and reset
  // their sharing choices so the claimant can review them before sharing.
  await tx.update(personPlaces)
    .set({ createdByUserId: userId, visibility: 'private' })
    .where(and(eq(personPlaces.personId, invitedPerson.id), ne(personPlaces.createdByUserId, userId)));
  await tx.update(personCommunities)
    .set({ createdByUserId: userId, visibility: 'private' })
    .where(and(eq(personCommunities.personId, invitedPerson.id), ne(personCommunities.createdByUserId, userId)));
  await tx.update(people).set({
    userId,
    firstName: accountPerson.firstName,
    lastName: accountPerson.lastName,
    otherNames: accountPerson.otherNames,
    gender: accountPerson.gender,
    birthDate: accountPerson.birthDate,
    isLiving: accountPerson.isLiving,
    updatedAt: new Date(),
  }).where(eq(people.id, invitedPerson.id));
  await tx.update(familyInvitations).set({ status: 'expired' }).where(and(
    eq(familyInvitations.personId, invitedPerson.id),
    eq(familyInvitations.status, 'pending'),
    ne(familyInvitations.id, invitationId),
  ));
  await tx.delete(people).where(eq(people.id, accountPerson.id));

  return invitedPerson.id;
}

// 3. Get Complete User Overview
export async function getUserOverview(userId: number) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    const person = await ensureUserPerson(userId, user.email, user.displayName);
    const profileRecords = await db.select().from(profiles).where(eq(profiles.personId, person.id));
    const profile = profileRecords[0] || {
      id: 0,
      personId: person.id,
      bio: null,
      currentResidenceSummary: null,
      originSummary: null,
      avatarUrl: null,
      visibility: 'private' as VisibilitySetting,
      updatedAt: new Date(),
    };

    // Calculate aggregated stats
    const userPlaces = await db
      .select({ country: places.country, placeId: places.id })
      .from(personPlaces)
      .innerJoin(places, eq(personPlaces.placeId, places.id))
      .where(eq(personPlaces.personId, person.id));

    const distinctCountries = new Set(userPlaces.map((p) => p.country)).size;
    const placesCount = userPlaces.length;

    const userCommunitiesList = await db
      .select({ id: personCommunities.id })
      .from(personCommunities)
      .where(eq(personCommunities.personId, person.id));
    const communitiesCount = userCommunitiesList.length;

    const familyConnections = await db
      .select({ id: personRelationships.id })
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.createdByUserId, userId),
          or(eq(personRelationships.personAId, person.id), eq(personRelationships.personBId, person.id))
        )
      );
    const familyCount = familyConnections.length;

    // Recent activity for this user
    const recentEvents = await db
      .select({
        id: activityEvents.id,
        summary: activityEvents.summary,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(5);

    const recentPrivacyEvents = await db
      .select({
        id: activityEvents.id,
        metadata: activityEvents.metadata,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(and(
        eq(activityEvents.userId, userId),
        or(
          eq(activityEvents.eventType, 'PROFILE_SHARING_PREFERENCE_UPDATED'),
          eq(activityEvents.eventType, 'PLACE_SHARING_PREFERENCE_UPDATED'),
        ),
      ))
      .orderBy(desc(activityEvents.createdAt))
      .limit(5);

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
        visibility: profile.visibility as VisibilitySetting,
      },
      stats: {
        countriesCount: distinctCountries,
        placesCount,
        communitiesCount,
        familyCount,
      },
      recentActivity: recentEvents.map((e) => ({
        id: e.id,
        summary: e.summary,
        createdAt: e.createdAt.toISOString(),
      })),
      privacyHistory: recentPrivacyEvents.map((event) => {
        let metadata: Record<string, string> = {};
        try {
          metadata = event.metadata ? JSON.parse(event.metadata) : {};
        } catch {
          metadata = {};
        }
        return {
          id: event.id,
          previous: metadata.previous || 'private',
          selected: metadata.selected || 'private',
          scope: metadata.scope === 'place_connection' ? 'Place' : 'Profile',
          createdAt: event.createdAt.toISOString(),
        };
      }),
    };
  } catch (error) {
    console.error('Database error in getUserOverview:', error);
    throw new Error('Failed to load user overview.', { cause: error });
  }
}

// 4. Update Profile
export async function updateUserProfile(
  userId: number,
  data: {
    firstName?: string;
    lastName?: string;
    otherNames?: string | null;
    bio?: string | null;
    currentResidenceSummary?: string | null;
    originSummary?: string | null;
    visibility?: VisibilitySetting;
    avatarUrl?: string | null;
  }
) {
  try {
    const person = await ensureUserPerson(userId, '');
    const [previousProfile] = await db.select().from(profiles).where(eq(profiles.personId, person.id));
    
    // Update person name if provided
    if (data.firstName || data.lastName || data.otherNames !== undefined) {
      await db
        .update(people)
        .set({
          firstName: data.firstName || person.firstName,
          lastName: data.lastName || person.lastName,
          otherNames: data.otherNames !== undefined ? data.otherNames : person.otherNames,
          updatedAt: new Date(),
        })
        .where(eq(people.id, person.id));

      // Also update user displayName
      const combined = `${data.firstName || person.firstName} ${data.lastName || person.lastName}`.trim();
      await db.update(users).set({ displayName: combined }).where(eq(users.id, userId));
    }

    // Update profile table
    const [updatedProfile] = await db
      .insert(profiles)
      .values({
        personId: person.id,
        bio: data.bio ?? null,
        currentResidenceSummary: data.currentResidenceSummary ?? null,
        originSummary: data.originSummary ?? null,
        visibility: data.visibility || 'private',
        avatarUrl: data.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: profiles.personId,
        set: {
          bio: data.bio !== undefined ? data.bio : sql`${profiles.bio}`,
          currentResidenceSummary:
            data.currentResidenceSummary !== undefined
              ? data.currentResidenceSummary
              : sql`${profiles.currentResidenceSummary}`,
          originSummary: data.originSummary !== undefined ? data.originSummary : sql`${profiles.originSummary}`,
          visibility: data.visibility || sql`${profiles.visibility}`,
          avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : sql`${profiles.avatarUrl}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    await recordActivityEvent(
      'PROFILE_UPDATED',
      'Personal profile information updated',
      userId,
      'profile',
      updatedProfile.id
    );

    if (data.visibility && previousProfile?.visibility !== data.visibility) {
      await recordActivityEvent(
        'PROFILE_SHARING_PREFERENCE_UPDATED',
        'Profile sharing preference changed',
        userId,
        'profile',
        updatedProfile.id,
        {
          scope: 'profile_details_through_family_connections',
          previous: previousProfile?.visibility || 'private',
          selected: data.visibility,
        }
      );
    }

    return updatedProfile;
  } catch (error) {
    console.error('Database error in updateUserProfile:', error);
    throw new Error('Failed to update personal profile.', { cause: error });
  }
}

// 5. Complete Onboarding
export async function completeOnboarding(userId: number) {
  try {
    await db.update(users).set({ onboardingCompleted: true, updatedAt: new Date() }).where(eq(users.id, userId));
    await recordActivityEvent('ONBOARDING_COMPLETED', 'User completed initial onboarding tour', userId, 'user', userId);
    return { success: true };
  } catch (error) {
    console.error('Database error in completeOnboarding:', error);
    throw new Error('Failed to record onboarding completion.', { cause: error });
  }
}

// 6. Places Management
export async function getUserPlaces(userId: number) {
  try {
    const person = await ensureUserPerson(userId, '');
    const results = await db
      .select({
        connectionId: personPlaces.id,
        personId: personPlaces.personId,
        connectionType: personPlaces.connectionType,
        humanLabel: personPlaces.humanLabel,
        isCurrent: personPlaces.isCurrent,
        notes: personPlaces.notes,
        visibility: personPlaces.visibility,
        createdAt: personPlaces.createdAt,
        id: places.id,
        name: places.name,
        country: places.country,
        stateRegion: places.stateRegion,
        districtLga: places.districtLga,
        townCity: places.townCity,
        villageLocality: places.villageLocality,
        placeType: places.placeType,
        latitude: places.latitude,
        longitude: places.longitude,
      })
      .from(personPlaces)
      .innerJoin(places, eq(personPlaces.placeId, places.id))
      .where(eq(personPlaces.personId, person.id))
      .orderBy(desc(personPlaces.createdAt));

    return results;
  } catch (error) {
    console.error('Database error in getUserPlaces:', error);
    throw new Error('Failed to load connected places.', { cause: error });
  }
}

export async function addPlaceConnection(
  userId: number,
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
    forPersonId?: number; // optional: connect for a family member
  }
) {
  try {
    const defaultPerson = await ensureUserPerson(userId, '');
    const targetPersonId = data.forPersonId || defaultPerson.id;
    if (targetPersonId !== defaultPerson.id) {
      const targetPerson = await requireManageablePerson(userId, targetPersonId);
      if (targetPerson.isLiving && targetPerson.userId === null) {
        throw new Error('Add personal place details after this living relative claims their family record.');
      }
    }

    // Check if matching place exists or insert new place
    const existing = await db
      .select()
      .from(places)
      .where(
        and(
          ilike(places.name, data.name.trim()),
          ilike(places.country, data.country.trim())
        )
      );

    let placeId: number;
    if (existing.length > 0) {
      placeId = existing[0].id;
    } else {
      const [newPlace] = await db
        .insert(places)
        .values({
          name: data.name.trim(),
          country: data.country.trim(),
          stateRegion: data.stateRegion || null,
          districtLga: data.districtLga || null,
          townCity: data.townCity || null,
          villageLocality: data.villageLocality || null,
          placeType: data.placeType || 'town',
        })
        .returning();
      placeId = newPlace.id;
    }

    // Default human label if not provided
    let humanLabel = data.humanLabel;
    if (!humanLabel) {
      switch (data.connectionType) {
        case 'residence':
          humanLabel = 'Where I live';
          break;
        case 'origin':
          humanLabel = "Where I'm from";
          break;
        case 'family_ancestral':
          humanLabel = 'Family/ancestral place';
          break;
        case 'birthplace':
          humanLabel = 'Birthplace';
          break;
        case 'work':
          humanLabel = 'Work location';
          break;
        case 'study':
          humanLabel = 'Study location';
          break;
        default:
          humanLabel = 'Connected place';
      }
    }

    const [existingConnection] = await db.select().from(personPlaces).where(and(
      eq(personPlaces.personId, targetPersonId),
      eq(personPlaces.placeId, placeId),
      eq(personPlaces.connectionType, data.connectionType),
      eq(personPlaces.createdByUserId, userId)
    ));
    if (existingConnection) return existingConnection;

    const [connection] = await db
      .insert(personPlaces)
      .values({
        personId: targetPersonId,
        placeId,
        connectionType: data.connectionType,
        humanLabel,
        isCurrent: Boolean(data.isCurrent),
        notes: data.notes || null,
        visibility: data.visibility || 'private',
        createdByUserId: userId,
      })
      .returning();

    await recordActivityEvent(
      'PLACE_ADDED',
      `Added place connection: ${data.name}, ${data.country} (${humanLabel})`,
      userId,
      'place',
      placeId
    );

    return connection;
  } catch (error) {
    console.error('Database error in addPlaceConnection:', error);
    throw new Error('Failed to connect place.', { cause: error });
  }
}

export async function removePlaceConnection(userId: number, connectionId: number) {
  try {
    const [deleted] = await db
      .delete(personPlaces)
      .where(and(eq(personPlaces.id, connectionId), eq(personPlaces.createdByUserId, userId)))
      .returning();

    if (!deleted) {
      throw new Error('Connection not found or permission denied');
    }

    await recordActivityEvent(
      'PLACE_REMOVED',
      'Removed place connection',
      userId,
      'place',
      deleted.placeId
    );

    return { success: true };
  } catch (error) {
    console.error('Database error in removePlaceConnection:', error);
    throw new Error('Failed to remove place connection.', { cause: error });
  }
}

export async function updatePlaceConnection(
  userId: number,
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
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [connection] = await tx
        .select({ id: personPlaces.id, placeId: personPlaces.placeId, personId: personPlaces.personId, visibility: personPlaces.visibility })
        .from(personPlaces)
        .where(and(eq(personPlaces.id, connectionId), eq(personPlaces.createdByUserId, userId)));
      if (!connection) throw new Error('Place connection not found or permission denied');

      const [owner] = await tx.select({ userId: people.userId, isLiving: people.isLiving })
        .from(people)
        .where(eq(people.id, connection.personId));
      if (owner?.isLiving && owner.userId === null) {
        throw new Error('Personal place details can be edited after this living relative claims their record.');
      }

      const [referenceCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(personPlaces)
        .where(eq(personPlaces.placeId, connection.placeId));

      let placeId = connection.placeId;
      const placeValues = {
        name: data.name.trim(),
        country: data.country.trim(),
        stateRegion: data.stateRegion?.trim() || null,
        districtLga: data.districtLga?.trim() || null,
        townCity: data.townCity?.trim() || null,
        villageLocality: data.villageLocality?.trim() || null,
        placeType: data.placeType || 'town',
      };

      if (Number(referenceCount?.count || 0) > 1) {
        const [newPlace] = await tx.insert(places).values(placeValues).returning({ id: places.id });
        placeId = newPlace.id;
      } else {
        await tx.update(places).set(placeValues).where(eq(places.id, placeId));
      }

      await tx.update(personPlaces).set({
        placeId,
        connectionType: data.connectionType,
        humanLabel: data.humanLabel?.trim() || null,
        isCurrent: Boolean(data.isCurrent),
        notes: data.notes?.trim() || null,
        visibility: data.visibility || 'private',
      }).where(eq(personPlaces.id, connectionId));

      if (data.visibility && data.visibility !== connection.visibility) {
        await tx.insert(activityEvents).values({
          eventType: 'PLACE_SHARING_PREFERENCE_UPDATED',
          summary: 'Place sharing preference changed',
          userId,
          targetType: 'place_connection',
          targetId: connection.id,
          metadata: JSON.stringify({
            scope: 'place_connection',
            previous: connection.visibility,
            selected: data.visibility,
          }),
        });
      }

      await recordActivityEvent(
        'PLACE_UPDATED',
        `Updated place connection: ${placeValues.name}, ${placeValues.country}`,
        userId,
        'place',
        placeId
      );

      return { success: true };
    });
  } catch (error) {
    console.error('Database error in updatePlaceConnection:', error);
    throw new Error('Failed to update place connection.', { cause: error });
  }
}

// 7. Communities Management
export async function getUserCommunities(userId: number) {
  try {
    const person = await ensureUserPerson(userId, '');
    const results = await db
      .select({
        connectionId: personCommunities.id,
        personId: personCommunities.personId,
        connectionType: personCommunities.connectionType,
        humanLabel: personCommunities.humanLabel,
        notes: personCommunities.notes,
        visibility: personCommunities.visibility,
        createdAt: personCommunities.createdAt,
        id: communities.id,
        name: communities.name,
        communityType: communities.communityType,
        description: communities.description,
        associatedPlaceId: communities.associatedPlaceId,
        associatedPlaceName: places.name,
        associatedPlaceCountry: places.country,
      })
      .from(personCommunities)
      .innerJoin(communities, eq(personCommunities.communityId, communities.id))
      .leftJoin(places, eq(communities.associatedPlaceId, places.id))
      .where(eq(personCommunities.personId, person.id))
      .orderBy(desc(personCommunities.createdAt));

    return results.map((community) => ({ ...community, visibility: 'private' as const }));
  } catch (error) {
    console.error('Database error in getUserCommunities:', error);
    throw new Error('Failed to load communities.', { cause: error });
  }
}

export async function addCommunityConnection(
  userId: number,
  data: {
    name: string;
    communityType?: CommunityType;
    description?: string | null;
    associatedPlaceId?: number | null;
    connectionType: CommunityConnectionType;
    humanLabel?: string | null;
    notes?: string | null;
    visibility?: VisibilitySetting;
  }
) {
  try {
    const person = await ensureUserPerson(userId, '');

    // Check if community exists or create new
    const existing = await db
      .select()
      .from(communities)
      .where(ilike(communities.name, data.name.trim()));

    let communityId: number;
    if (existing.length > 0) {
      communityId = existing[0].id;
    } else {
      const [newCommunity] = await db
        .insert(communities)
        .values({
          name: data.name.trim(),
          communityType: data.communityType || 'hometown',
          description: data.description || null,
          associatedPlaceId: data.associatedPlaceId || null,
          visibility: 'private',
          createdByUserId: userId,
        })
        .returning();
      communityId = newCommunity.id;
    }

    let humanLabel = data.humanLabel;
    if (!humanLabel) {
      switch (data.connectionType) {
        case 'resident':
          humanLabel = 'Resident';
          break;
        case 'member':
          humanLabel = 'Member';
          break;
        case 'origin':
          humanLabel = 'Community of Origin';
          break;
        case 'ancestral_connection':
          humanLabel = 'Ancestral Connection';
          break;
        case 'family_connection':
          humanLabel = 'Family Connection';
          break;
        case 'marriage_connection':
          humanLabel = 'Marriage Connection';
          break;
        case 'professional':
          humanLabel = 'Professional Association';
          break;
        default:
          humanLabel = 'Community Connection';
      }
    }

    const [existingConnection] = await db.select().from(personCommunities).where(and(
      eq(personCommunities.personId, person.id),
      eq(personCommunities.communityId, communityId),
      eq(personCommunities.connectionType, data.connectionType),
      eq(personCommunities.createdByUserId, userId)
    ));
    if (existingConnection) return existingConnection;

    const [connection] = await db
      .insert(personCommunities)
      .values({
        personId: person.id,
        communityId,
        connectionType: data.connectionType,
        humanLabel,
        notes: data.notes || null,
        visibility: 'private',
        createdByUserId: userId,
      })
      .returning();

    await recordActivityEvent(
      'COMMUNITY_ADDED',
      `Connected to community: ${data.name} (${humanLabel})`,
      userId,
      'community',
      communityId
    );

    return connection;
  } catch (error) {
    console.error('Database error in addCommunityConnection:', error);
    throw new Error('Failed to connect to community.', { cause: error });
  }
}

export async function removeCommunityConnection(userId: number, connectionId: number) {
  try {
    const [deleted] = await db
      .delete(personCommunities)
      .where(
        and(
          eq(personCommunities.id, connectionId),
          eq(personCommunities.createdByUserId, userId)
        )
      )
      .returning();

    if (!deleted) {
      throw new Error('Community connection not found or permission denied');
    }

    await recordActivityEvent(
      'COMMUNITY_REMOVED',
      'Removed community connection',
      userId,
      'community',
      deleted.communityId
    );

    return { success: true };
  } catch (error) {
    console.error('Database error in removeCommunityConnection:', error);
    throw new Error('Failed to remove community connection.', { cause: error });
  }
}

// 8. Family & Relationships Management: Deduplication & Consolidation Engine
export async function consolidateFamilyConnections(userId: number) {
  try {
    const userPerson = await ensureUserPerson(userId, '');

    // Get relationships created by this user involving their person
    const rels = await db
      .select({
        id: personRelationships.id,
        personAId: personRelationships.personAId,
        personBId: personRelationships.personBId,
        relationshipType: personRelationships.relationshipType,
        inverseRelationshipType: personRelationships.inverseRelationshipType,
        createdByUserId: personRelationships.createdByUserId,
        notes: personRelationships.notes,
        createdAt: personRelationships.createdAt,
      })
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.createdByUserId, userId),
          or(
            eq(personRelationships.personAId, userPerson.id),
            eq(personRelationships.personBId, userPerson.id)
          )
        )
      )
      .orderBy(desc(personRelationships.createdAt));

    if (rels.length <= 1) return;

    // Collect connected person record for each relationship
    const items: Array<{
      rel: typeof rels[0];
      otherPerson: typeof people.$inferSelect;
      displayedType: RelationshipType;
    }> = [];

    for (const rel of rels) {
      const otherPersonId = rel.personAId === userPerson.id ? rel.personBId : rel.personAId;
      const [otherPerson] = await db.select().from(people).where(eq(people.id, otherPersonId));
      if (otherPerson) {
        const displayedType = (rel.personAId === userPerson.id
          ? rel.relationshipType
          : rel.inverseRelationshipType || getInverseRelationship(rel.relationshipType as RelationshipType)) as RelationshipType;
        items.push({ rel, otherPerson, displayedType });
      }
    }

    const removedRelIds = new Set<number>();

    // 1. Group by otherPerson.userId (when linked to a registered account)
    const accountGroups = new Map<number, typeof items>();
    for (const item of items) {
      if (item.otherPerson.userId) {
        const uid = item.otherPerson.userId;
        if (!accountGroups.has(uid)) accountGroups.set(uid, []);
        accountGroups.get(uid)!.push(item);
      }
    }

    for (const [targetUid, group] of accountGroups.entries()) {
      if (group.length > 1) {
        // Sort group to identify canonical record:
        // Priority 1: Person created by the target user themselves (canonical user profile)
        // Priority 2: Lower person ID (older, original)
        const sorted = [...group].sort((a, b) => {
          const aIsSelfCreated = a.otherPerson.createdByUserId === targetUid ? 1 : 0;
          const bIsSelfCreated = b.otherPerson.createdByUserId === targetUid ? 1 : 0;
          if (aIsSelfCreated !== bIsSelfCreated) return bIsSelfCreated - aIsSelfCreated;
          return a.otherPerson.id - b.otherPerson.id;
        });

        const canonical = sorted[0];
        const duplicates = sorted.slice(1);

        for (const dup of duplicates) {
          if (removedRelIds.has(dup.rel.id)) continue;
          removedRelIds.add(dup.rel.id);

          // Delete the duplicate relationship
          await db.delete(personRelationships).where(eq(personRelationships.id, dup.rel.id));

          // If the duplicate person was created by this user and is not referenced in any other relationships:
          if (dup.otherPerson.createdByUserId === userId && dup.otherPerson.id !== canonical.otherPerson.id) {
            const otherRels = await db
              .select({ id: personRelationships.id })
              .from(personRelationships)
              .where(
                or(
                  eq(personRelationships.personAId, dup.otherPerson.id),
                  eq(personRelationships.personBId, dup.otherPerson.id)
                )
              );

            if (otherRels.length === 0) {
              // Migrate places before deleting
              await db
                .update(personPlaces)
                .set({ personId: canonical.otherPerson.id })
                .where(eq(personPlaces.personId, dup.otherPerson.id));
              await db.delete(profiles).where(eq(profiles.personId, dup.otherPerson.id));
              await db.delete(people).where(eq(people.id, dup.otherPerson.id));
            }
          }
        }
      }
    }

    // 2. Group by normalized name (firstName + lastName) and relationshipType
    const nameGroups = new Map<string, typeof items>();
    for (const item of items) {
      if (removedRelIds.has(item.rel.id)) continue;
      const fn = (item.otherPerson.firstName || '').trim().toLowerCase();
      const ln = (item.otherPerson.lastName || '').trim().toLowerCase();
      const key = `${fn}_${ln}_${item.displayedType}`;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key)!.push(item);
    }

    for (const [_, group] of nameGroups.entries()) {
      if (group.length > 1) {
        // Priority: Registered user first, then lowest ID
        const sorted = [...group].sort((a, b) => {
          const aHasUser = a.otherPerson.userId ? 1 : 0;
          const bHasUser = b.otherPerson.userId ? 1 : 0;
          if (aHasUser !== bHasUser) return bHasUser - aHasUser;
          return a.otherPerson.id - b.otherPerson.id;
        });

        const canonical = sorted[0];
        const duplicates = sorted.slice(1);

        for (const dup of duplicates) {
          if (removedRelIds.has(dup.rel.id)) continue;
          removedRelIds.add(dup.rel.id);

          await db.delete(personRelationships).where(eq(personRelationships.id, dup.rel.id));

          if (dup.otherPerson.createdByUserId === userId && dup.otherPerson.id !== canonical.otherPerson.id) {
            const otherRels = await db
              .select({ id: personRelationships.id })
              .from(personRelationships)
              .where(
                or(
                  eq(personRelationships.personAId, dup.otherPerson.id),
                  eq(personRelationships.personBId, dup.otherPerson.id)
                )
              );

            if (otherRels.length === 0) {
              await db
                .update(personPlaces)
                .set({ personId: canonical.otherPerson.id })
                .where(eq(personPlaces.personId, dup.otherPerson.id));
              await db.delete(profiles).where(eq(profiles.personId, dup.otherPerson.id));
              await db.delete(people).where(eq(people.id, dup.otherPerson.id));
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error consolidating family connections:', error);
  }
}

export async function getUserFamily(userId: number) {
  try {
    const userPerson = await ensureUserPerson(userId, '');

    // Auto-heal and consolidate duplicate relationships before fetching
    await consolidateFamilyConnections(userId);

    // Get relationships created by this user involving their person
    const relationships = await db
      .select({
        relationshipId: personRelationships.id,
        personAId: personRelationships.personAId,
        personBId: personRelationships.personBId,
        relationshipType: personRelationships.relationshipType,
        inverseRelationshipType: personRelationships.inverseRelationshipType,
        notes: personRelationships.notes,
        visibility: personRelationships.visibility,
        createdAt: personRelationships.createdAt,
      })
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.createdByUserId, userId),
          or(
            eq(personRelationships.personAId, userPerson.id),
            eq(personRelationships.personBId, userPerson.id)
          )
        )
      )
      .orderBy(desc(personRelationships.createdAt));

    // Gather details for each connected person
    const familyMembersList = [];
    const seenUserIds = new Set<number>();
    const seenNameRelKeys = new Set<string>();

    for (const rel of relationships) {
      const otherPersonId = rel.personAId === userPerson.id ? rel.personBId : rel.personAId;
      const [otherPerson] = await db.select().from(people).where(eq(people.id, otherPersonId));

      if (otherPerson) {
        // Compute relationship label from userPerson's perspective
        const displayedType = (rel.personAId === userPerson.id
          ? rel.relationshipType
          : rel.inverseRelationshipType || getInverseRelationship(rel.relationshipType as RelationshipType)) as RelationshipType;

        // In-memory deduplication defense
        if (otherPerson.userId && seenUserIds.has(otherPerson.userId)) {
          continue;
        }
        const nameRelKey = `${(otherPerson.firstName || '').trim().toLowerCase()}_${(otherPerson.lastName || '').trim().toLowerCase()}_${displayedType}`;
        if (seenNameRelKeys.has(nameRelKey)) {
          continue;
        }

        if (otherPerson.userId) {
          seenUserIds.add(otherPerson.userId);
        }
        seenNameRelKeys.add(nameRelKey);

        const [profile] = await db.select().from(profiles).where(eq(profiles.personId, otherPerson.id));
        const isAnotherAccount = Boolean(otherPerson.userId && otherPerson.userId !== userId);
        const hasClaimedLivingRecord = !otherPerson.isLiving || Boolean(otherPerson.userId);
        const canViewSharedDetails = hasClaimedLivingRecord && (
          !isAnotherAccount || profile?.visibility === 'shared' || profile?.visibility === 'public'
        );
        const visiblePlaceFilter = isAnotherAccount
          ? and(eq(personPlaces.personId, otherPerson.id), or(eq(personPlaces.visibility, 'shared'), eq(personPlaces.visibility, 'public')))
          : eq(personPlaces.personId, otherPerson.id);

        // Do not count or return another account's private place records.
        const placeCountRes = await db
          .select({ count: sql<number>`count(*)` })
          .from(personPlaces)
          .where(visiblePlaceFilter);

        // Do not disclose account email addresses through a family relationship.
        let userDisplayName: string | null = null;
        if (otherPerson.userId && canViewSharedDetails) {
          const [u] = await db
            .select({ displayName: users.displayName })
            .from(users)
            .where(eq(users.id, otherPerson.userId));
          if (u) {
            userDisplayName = u.displayName;
          }
        }

        // Place of origin / residence for geographic context
        const originRes = await db
          .select({ name: places.name, country: places.country })
          .from(personPlaces)
          .innerJoin(places, eq(personPlaces.placeId, places.id))
          .where(
            and(
              eq(personPlaces.personId, otherPerson.id),
              or(eq(personPlaces.connectionType, 'origin'), eq(personPlaces.connectionType, 'birthplace'), eq(personPlaces.connectionType, 'residence')),
              ...(isAnotherAccount ? [or(eq(personPlaces.visibility, 'shared'), eq(personPlaces.visibility, 'public'))] : [])
            )
          )
          .limit(1);

        familyMembersList.push({
          relationshipId: rel.relationshipId,
          personId: otherPerson.id,
          firstName: otherPerson.firstName,
          lastName: otherPerson.lastName,
          otherNames: canViewSharedDetails ? otherPerson.otherNames : null,
          gender: canViewSharedDetails ? otherPerson.gender : null,
          birthDate: canViewSharedDetails ? otherPerson.birthDate : null,
          isLiving: otherPerson.isLiving,
          relationshipType: displayedType,
          inverseRelationshipType: rel.inverseRelationshipType,
          notes: canViewSharedDetails ? rel.notes : null,
          placesCount: hasClaimedLivingRecord ? Number(placeCountRes[0]?.count || 0) : 0,
          userId: otherPerson.userId,
          hasAccount: Boolean(otherPerson.userId),
          userEmail: null,
          userDisplayName,
          visibility: profile?.visibility || 'private',
          originSummary: canViewSharedDetails ? profile?.originSummary || null : null,
          currentResidenceSummary: canViewSharedDetails ? profile?.currentResidenceSummary || null : null,
          placeOfOrigin: canViewSharedDetails ? originRes[0] || null : null,
        });
      }
    }

    return familyMembersList;
  } catch (error) {
    console.error('Database error in getUserFamily:', error);
    throw new Error('Failed to load family connections.', { cause: error });
  }
}

export async function getUserFamilyGroups(userId: number) {
  const groups = await db.selectDistinct({
    id: families.id,
    name: families.name,
    description: families.description,
    createdByUserId: families.createdByUserId,
    createdAt: families.createdAt,
  }).from(families)
    .leftJoin(familyGroupInvitations, and(
      eq(familyGroupInvitations.groupId, families.id),
      eq(familyGroupInvitations.inviteeUserId, userId),
      eq(familyGroupInvitations.status, 'accepted'),
    ))
    .where(or(eq(families.createdByUserId, userId), eq(familyGroupInvitations.inviteeUserId, userId)))
    .orderBy(desc(families.createdAt));

  return Promise.all(groups.map(async (group) => {
    const isOwner = group.createdByUserId === userId;
    const ownerRows = await db.select({ id: users.id, displayName: users.displayName, createdAt: families.createdAt })
      .from(families).innerJoin(users, eq(families.createdByUserId, users.id))
      .where(eq(families.id, group.id));
    const inviteRows = await db.select({
      invitationId: familyGroupInvitations.id,
      status: familyGroupInvitations.status,
      relationshipType: familyGroupInvitations.relationshipType,
      invitedAt: familyGroupInvitations.createdAt,
      acceptedAt: familyGroupInvitations.acceptedAt,
      userId: users.id,
      displayName: users.displayName,
      firstName: people.firstName,
      lastName: people.lastName,
      personId: people.id,
    }).from(familyGroupInvitations)
      .innerJoin(users, eq(familyGroupInvitations.inviteeUserId, users.id))
      .innerJoin(people, eq(familyGroupInvitations.personId, people.id))
      .where(and(
        eq(familyGroupInvitations.groupId, group.id),
        or(
          eq(familyGroupInvitations.status, 'accepted'),
          ...(isOwner ? [and(eq(familyGroupInvitations.status, 'pending'), gt(familyGroupInvitations.expiresAt, new Date()))] : []),
        ),
      ));
    const owner = ownerRows[0];
    const members = [
      ...(owner ? [{ userId: owner.id, name: owner.displayName || 'Group organiser', personId: null, relationshipType: 'self', joinedAt: owner.createdAt.toISOString(), status: 'accepted' as const, isOrganizer: true, isCurrentUser: owner.id === userId }] : []),
      ...inviteRows.map((invite) => ({
        userId: invite.userId,
        name: invite.displayName || `${invite.firstName} ${invite.lastName}`.trim() || 'Family member',
        personId: invite.personId,
        relationshipType: invite.relationshipType,
        joinedAt: (invite.acceptedAt || invite.invitedAt).toISOString(),
        status: invite.status as 'pending' | 'accepted',
        isOrganizer: false,
        isCurrentUser: invite.userId === userId,
      })),
    ];
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      isOwner,
      members,
    };
  }));
}

export async function createUserFamilyGroup(userId: number, input: { name: string; description?: string | null; personIds: number[] }) {
  const name = input.name.trim();
  if (!name || name.length > 100) throw new Error('Enter a group name up to 100 characters.');
  const description = input.description?.trim() || null;
  if (description && description.length > 1000) throw new Error('Group description must be 1,000 characters or fewer.');

  await ensureUserPerson(userId, '');
  const family = await getUserFamily(userId);
  const familyByPersonId = new Map(family.map((member) => [member.personId, member]));
  const selectedIds = [...new Set(input.personIds)];
  if (selectedIds.length === 0) throw new Error('Choose at least one family member to invite.');
  if (selectedIds.some((personId) => !familyByPersonId.has(personId))) {
    throw new Error('Groups can invite only people already connected to your family.');
  }
  const selectedMembers = selectedIds.map((personId) => familyByPersonId.get(personId)!);
  if (selectedMembers.some((member) => !member.userId || member.userId === userId)) {
    throw new Error('Every group participant needs a GeoSmart account. Invite relatives to GeoSmart first, then add them to a group.');
  }

  const group = await db.transaction(async (tx) => {
    const [created] = await tx.insert(families).values({
      name,
      description,
      visibility: 'private',
      createdByUserId: userId,
    }).returning({ id: families.id, name: families.name, description: families.description, createdAt: families.createdAt });

    await tx.insert(familyGroupInvitations).values(selectedMembers.map((member) => ({
      groupId: created.id,
      inviterUserId: userId,
      inviteeUserId: member.userId!,
      personId: member.personId,
      relationshipType: member.relationshipType,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })));
    return created;
  });

  await recordActivityEvent('FAMILY_GROUP_CREATED', `Created family group: ${name}`, userId, 'family_group', group.id, { invitationCount: selectedIds.length });
  return { id: group.id };
}

export async function updateUserFamilyGroup(userId: number, groupId: number, input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  if (!name || name.length > 100) throw new Error('Enter a group name up to 100 characters.');
  if (description && description.length > 1000) throw new Error('Group description must be 1,000 characters or fewer.');
  const [updated] = await db.update(families).set({ name, description })
    .where(and(eq(families.id, groupId), eq(families.createdByUserId, userId)))
    .returning({ id: families.id, name: families.name });
  if (!updated) throw new Error('Only the group organiser can rename this group.');
  await recordActivityEvent('FAMILY_GROUP_UPDATED', `Updated family group: ${name}`, userId, 'family_group', groupId);
  return { success: true, name: updated.name };
}

export async function deleteUserFamilyGroup(userId: number, groupId: number) {
  const [deleted] = await db.delete(families).where(and(
    eq(families.id, groupId),
    eq(families.createdByUserId, userId),
  )).returning({ id: families.id, name: families.name });
  if (!deleted) throw new Error('Group not found or permission denied.');
  await recordActivityEvent('FAMILY_GROUP_DELETED', `Deleted family group: ${deleted.name}`, userId, 'family_group', deleted.id);
  return { success: true };
}

export async function inviteToFamilyGroup(userId: number, groupId: number, personId: number) {
  const [group] = await db.select({ id: families.id, name: families.name })
    .from(families)
    .where(and(eq(families.id, groupId), eq(families.createdByUserId, userId)));
  if (!group) throw new Error('Only the group organiser can invite members.');
  const family = await getUserFamily(userId);
  const person = family.find((member) => member.personId === personId);
  if (!person?.userId || person.userId === userId) throw new Error('Choose a connected relative with a GeoSmart account.');

  const [existing] = await db.select().from(familyGroupInvitations)
    .where(and(
      eq(familyGroupInvitations.groupId, groupId),
      eq(familyGroupInvitations.inviteeUserId, person.userId),
    ))
    .orderBy(desc(familyGroupInvitations.createdAt))
    .limit(1);
  if (existing?.status === 'accepted') throw new Error('This person is already a member of the group.');
  if (existing?.status === 'pending' && existing.expiresAt > new Date()) throw new Error('An invitation is already pending for this person.');

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (existing) {
    await db.update(familyGroupInvitations).set({
      inviterUserId: userId,
      personId,
      relationshipType: person.relationshipType,
      status: 'pending',
      expiresAt,
      createdAt: new Date(),
      acceptedAt: null,
    }).where(eq(familyGroupInvitations.id, existing.id));
  } else {
    await db.insert(familyGroupInvitations).values({
      groupId,
      inviterUserId: userId,
      inviteeUserId: person.userId,
      personId,
      relationshipType: person.relationshipType,
      status: 'pending',
      expiresAt,
    });
  }
  await recordActivityEvent('FAMILY_GROUP_INVITATION_SENT', `Invited a relative to ${group.name}`, userId, 'family_group', groupId);
  return { success: true };
}

export async function getIncomingFamilyGroupInvitations(userId: number) {
  const invitations = await db.select({
    id: familyGroupInvitations.id,
    groupId: families.id,
    groupName: families.name,
    groupDescription: families.description,
    inviterUserId: users.id,
    inviterName: users.displayName,
    createdAt: familyGroupInvitations.createdAt,
    expiresAt: familyGroupInvitations.expiresAt,
  }).from(familyGroupInvitations)
    .innerJoin(families, eq(familyGroupInvitations.groupId, families.id))
    .innerJoin(users, eq(familyGroupInvitations.inviterUserId, users.id))
    .where(and(
      eq(familyGroupInvitations.inviteeUserId, userId),
      eq(familyGroupInvitations.status, 'pending'),
      gt(familyGroupInvitations.expiresAt, new Date()),
    ))
    .orderBy(desc(familyGroupInvitations.createdAt));
  return invitations.map((invitation) => ({
    ...invitation,
    inviterName: invitation.inviterName || 'A family member',
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
  }));
}

export async function respondToFamilyGroupInvitation(userId: number, invitationId: number, accept: boolean) {
  const [invitation] = await db.select({ id: familyGroupInvitations.id, groupId: familyGroupInvitations.groupId })
    .from(familyGroupInvitations)
    .where(and(
      eq(familyGroupInvitations.id, invitationId),
      eq(familyGroupInvitations.inviteeUserId, userId),
      eq(familyGroupInvitations.status, 'pending'),
      gt(familyGroupInvitations.expiresAt, new Date()),
    ));
  if (!invitation) throw new Error('Invitation is no longer available.');
  const now = new Date();
  await db.update(familyGroupInvitations)
    .set({ status: accept ? 'accepted' : 'declined', acceptedAt: accept ? now : null })
    .where(eq(familyGroupInvitations.id, invitationId));
  await recordActivityEvent(
    accept ? 'FAMILY_GROUP_INVITATION_ACCEPTED' : 'FAMILY_GROUP_INVITATION_DECLINED',
    accept ? 'Joined a family group' : 'Declined a family group invitation',
    userId,
    'family_group',
    invitation.groupId,
  );
  return { success: true, accepted: accept };
}

export async function removeFamilyGroupMember(actorUserId: number, groupId: number, targetUserId: number) {
  const [group] = await db.select({ id: families.id, name: families.name, createdByUserId: families.createdByUserId })
    .from(families).where(eq(families.id, groupId));
  if (!group) throw new Error('Family group not found.');
  if (targetUserId === group.createdByUserId) throw new Error('The organiser cannot leave this group. Delete the group if you no longer want to run it.');
  const isOrganizer = actorUserId === group.createdByUserId;
  if (!isOrganizer && actorUserId !== targetUserId) throw new Error('Only the organiser can remove another member.');
  const [membership] = await db.select({ id: familyGroupInvitations.id, status: familyGroupInvitations.status })
    .from(familyGroupInvitations)
    .where(and(
      eq(familyGroupInvitations.groupId, groupId),
      eq(familyGroupInvitations.inviteeUserId, targetUserId),
      inArray(familyGroupInvitations.status, ['pending', 'accepted']),
    ))
    .orderBy(desc(familyGroupInvitations.createdAt))
    .limit(1);
  if (!membership) throw new Error('This person is not an active group member or invitee.');
  await db.update(familyGroupInvitations).set({ status: 'revoked' }).where(eq(familyGroupInvitations.id, membership.id));
  await recordActivityEvent(
    isOrganizer ? 'FAMILY_GROUP_MEMBER_REMOVED' : 'FAMILY_GROUP_MEMBER_LEFT',
    isOrganizer ? 'Removed a member from a family group' : 'Left a family group',
    actorUserId,
    'family_group',
    groupId,
    { targetUserId },
  );
  return { success: true, groupName: group.name };
}

async function requireFamilyGroupMember(userId: number, groupId: number) {
  const [owned] = await db.select({ id: families.id }).from(families)
    .where(and(eq(families.id, groupId), eq(families.createdByUserId, userId)));
  if (owned) return;
  const [membership] = await db.select({ id: familyGroupInvitations.id }).from(familyGroupInvitations)
    .where(and(
      eq(familyGroupInvitations.groupId, groupId),
      eq(familyGroupInvitations.inviteeUserId, userId),
      eq(familyGroupInvitations.status, 'accepted'),
    ));
  if (!membership) throw new Error('You are not a member of this family group.');
}

export async function getFamilyGroupPosts(userId: number, groupId: number) {
  await requireFamilyGroupMember(userId, groupId);
  const posts = await db.select({
    id: familyGroupPosts.id,
    body: familyGroupPosts.body,
    createdAt: familyGroupPosts.createdAt,
    authorUserId: users.id,
    authorName: users.displayName,
  }).from(familyGroupPosts)
    .innerJoin(users, eq(familyGroupPosts.authorUserId, users.id))
    .where(eq(familyGroupPosts.groupId, groupId))
    .orderBy(desc(familyGroupPosts.createdAt));
  if (!posts.length) return [];
  const comments = await db.select({
    id: familyGroupComments.id,
    postId: familyGroupComments.postId,
    body: familyGroupComments.body,
    createdAt: familyGroupComments.createdAt,
    authorUserId: users.id,
    authorName: users.displayName,
  }).from(familyGroupComments)
    .innerJoin(users, eq(familyGroupComments.authorUserId, users.id))
    .where(inArray(familyGroupComments.postId, posts.map((post) => post.id)))
    .orderBy(familyGroupComments.createdAt);
  return posts.map((post) => ({
    ...post,
    authorName: post.authorName || 'Group member',
    createdAt: post.createdAt.toISOString(),
    comments: comments.filter((comment) => comment.postId === post.id).map((comment) => ({
      ...comment,
      authorName: comment.authorName || 'Group member',
      createdAt: comment.createdAt.toISOString(),
    })),
  }));
}

export async function createFamilyGroupPost(userId: number, groupId: number, body: string) {
  await requireFamilyGroupMember(userId, groupId);
  const content = body.trim();
  if (!content || content.length > 5000) throw new Error('Write a post up to 5,000 characters.');
  const [post] = await db.insert(familyGroupPosts).values({ groupId, authorUserId: userId, body: content }).returning({ id: familyGroupPosts.id });
  await recordActivityEvent('FAMILY_GROUP_POST_CREATED', 'Posted in a family group', userId, 'family_group_post', post.id, { groupId });
  return { id: post.id };
}

export async function createFamilyGroupComment(userId: number, groupId: number, postId: number, body: string) {
  await requireFamilyGroupMember(userId, groupId);
  const [post] = await db.select({ id: familyGroupPosts.id }).from(familyGroupPosts)
    .where(and(eq(familyGroupPosts.id, postId), eq(familyGroupPosts.groupId, groupId)));
  if (!post) throw new Error('Post not found in this group.');
  const content = body.trim();
  if (!content || content.length > 2000) throw new Error('Write a reply up to 2,000 characters.');
  const [comment] = await db.insert(familyGroupComments).values({ postId, authorUserId: userId, body: content }).returning({ id: familyGroupComments.id });
  await recordActivityEvent('FAMILY_GROUP_COMMENT_CREATED', 'Replied to a family group post', userId, 'family_group_post', post.id, { groupId });
  return { id: comment.id };
}

export async function getUserFamilyTree(userId: number) {
  try {
    const userPerson = await ensureUserPerson(userId, '');
    const [userProfile] = await db.select().from(profiles).where(eq(profiles.personId, userPerson.id));
    const [currentUser] = await db.select().from(users).where(eq(users.id, userId));

    // Get origin place for self
    const selfOriginRes = await db
      .select({ name: places.name, country: places.country })
      .from(personPlaces)
      .innerJoin(places, eq(personPlaces.placeId, places.id))
      .where(
        and(
          eq(personPlaces.personId, userPerson.id),
          or(eq(personPlaces.connectionType, 'origin'), eq(personPlaces.connectionType, 'birthplace'))
        )
      )
      .limit(1);

    const selfOrigin = selfOriginRes[0]
      ? `${selfOriginRes[0].name}, ${selfOriginRes[0].country}`
      : userProfile?.originSummary || null;

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
      userId: userId,
      userEmail: currentUser?.email || null,
      userDisplayName: currentUser?.displayName || null,
      notes: null,
      placeOfOrigin: selfOrigin,
      placesCount: 0,
      visibility: userProfile?.visibility || 'private',
    };

    // Get family connections
    const familyMembers = await getUserFamily(userId);

    const nodes = [selfNode];
    const generations: Record<number, any[]> = {
      2: [],    // Grandparents (+2)
      1: [],    // Parents (+1)
      0: [selfNode], // Self, Spouses, Siblings (0)
      [-1]: [], // Children (-1)
      [-2]: [], // Grandchildren (-2)
      3: [],    // Extended family
    };

    const placeMap = new Map<string, { name: string; country: string }>();
    if (selfOriginRes[0]) {
      placeMap.set(`${selfOriginRes[0].name}-${selfOriginRes[0].country}`, selfOriginRes[0]);
    }

    let membersWithAccounts = 1; // Current user

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
        ? `${member.placeOfOrigin.name}, ${member.placeOfOrigin.country}`
        : member.originSummary || null;

      if (member.placeOfOrigin) {
        placeMap.set(`${member.placeOfOrigin.name}-${member.placeOfOrigin.country}`, member.placeOfOrigin);
      }

      if (member.hasAccount) {
        membersWithAccounts++;
      }

      const node = {
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
      if (!generations[generation]) {
        generations[generation] = [];
      }
      generations[generation].push(node);
    }

    const generationsWithMembers = Object.entries(generations).filter(([_, list]) => list.length > 0);

    const summary = {
      totalMembers: nodes.length,
      generationsCount: generationsWithMembers.length,
      membersWithAccounts,
      placesCount: placeMap.size,
      placesList: Array.from(placeMap.values()),
    };

    return {
      self: selfNode,
      nodes,
      generations,
      summary,
    };
  } catch (error) {
    console.error('Database error in getUserFamilyTree:', error);
    throw new Error('Failed to generate family tree.', { cause: error });
  }
}

export async function addFamilyMember(
  userId: number,
  data: {
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    gender?: string | null;
    birthDate?: string | null;
    isLiving?: boolean;
    relationshipType: RelationshipType;
    notes?: string | null;
    visibility?: VisibilitySetting;
    existingPersonId?: number | null;
    connectExistingUserId?: number | null;
    connectUserEmail?: string | null;
    placeOfOrigin?: {
      name: string;
      country: string;
      stateRegion?: string | null;
      districtLga?: string | null;
      townCity?: string | null;
      villageLocality?: string | null;
      placeType?: string | null;
    };
  }
) {
  try {
    const supportedGenders = ['female', 'male', 'non_binary', 'another', 'unspecified'];
    if (data.gender && !supportedGenders.includes(data.gender)) {
      throw new Error('Choose a supported gender option.');
    }
    const userPerson = await ensureUserPerson(userId, '');

    if (data.connectExistingUserId || data.connectUserEmail?.trim()) {
      throw new Error('A registered account can only be linked after its owner accepts a family invitation.');
    }

    // Validation: Prevent impossible self-references
    if (data.existingPersonId && data.existingPersonId === userPerson.id) {
      throw new Error('A person cannot have a family relationship with themselves.');
    }
    if (data.connectExistingUserId && data.connectExistingUserId === userId) {
      throw new Error('You cannot add yourself as a family relative.');
    }

    let targetUserId = data.connectExistingUserId || null;

    // Check if an email address was provided to link an existing GeoSmart account
    if (data.connectUserEmail && data.connectUserEmail.trim()) {
      const cleanEmail = data.connectUserEmail.trim();
      const [matchedUser] = await db.select().from(users).where(ilike(users.email, cleanEmail));
      if (matchedUser) {
        if (matchedUser.id === userId) {
          throw new Error('You cannot add your own email as a family relative.');
        }
        targetUserId = matchedUser.id;
      }
    }

    let familyPersonId: number;

    // If linking to a registered user account, use or find their canonical person record
    if (targetUserId) {
      const [targetUserRecord] = await db.select().from(users).where(eq(users.id, targetUserId));
      const canonicalTargetPerson = await ensureUserPerson(
        targetUserId,
        targetUserRecord?.email || '',
        targetUserRecord?.displayName || `${data.firstName} ${data.lastName}`
      );

      // Check if current user ALREADY has a relationship with this person/account
      const existingRels = await db
        .select()
        .from(personRelationships)
        .where(
          and(
            eq(personRelationships.createdByUserId, userId),
            eq(personRelationships.personAId, userPerson.id)
          )
        );

      for (const er of existingRels) {
        const [other] = await db.select().from(people).where(eq(people.id, er.personBId));
        if (
          other &&
          (other.id === canonicalTargetPerson.id ||
            other.userId === targetUserId ||
            ((other.firstName || '').trim().toLowerCase() === data.firstName.trim().toLowerCase() &&
              (other.lastName || '').trim().toLowerCase() === data.lastName.trim().toLowerCase()))
        ) {
          // Existing account records are managed by their owner; do not alter them here.
          await consolidateFamilyConnections(userId);
          return {
            relationship: er,
            familyPerson: canonicalTargetPerson,
            alreadyConnected: true,
          };
        }
      }

      familyPersonId = canonicalTargetPerson.id;
    } else if (data.existingPersonId) {
      const existingPerson = await requireManageablePerson(userId, data.existingPersonId);
      if (existingPerson.userId !== null) throw new Error('That person is already linked to an account. Use a family invitation instead.');
      familyPersonId = existingPerson.id;
    } else {
      // Check if user already has an active relative with exact same first name, last name, and relationship type
      const existingRels = await db
        .select()
        .from(personRelationships)
        .where(
          and(
            eq(personRelationships.createdByUserId, userId),
            eq(personRelationships.personAId, userPerson.id)
          )
        );

      for (const er of existingRels) {
        const [other] = await db.select().from(people).where(eq(people.id, er.personBId));
        if (
          other &&
          (other.firstName || '').trim().toLowerCase() === data.firstName.trim().toLowerCase() &&
          (other.lastName || '').trim().toLowerCase() === data.lastName.trim().toLowerCase() &&
          er.relationshipType === data.relationshipType
        ) {
          // Keep an existing living relative as a minimal placeholder until they claim it.
          await consolidateFamilyConnections(userId);
          return {
            relationship: er,
            familyPerson: other,
            alreadyConnected: true,
          };
        }
      }

      // 1. Create person record for family member
      const [familyPerson] = await db
        .insert(people)
        .values({
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          otherNames: data.isLiving === false ? data.otherNames || null : null,
          gender: data.gender && data.gender !== 'unspecified' ? data.gender : null,
          birthDate: data.isLiving === false ? data.birthDate || null : null,
          isLiving: data.isLiving !== undefined ? Boolean(data.isLiving) : true,
          createdByUserId: userId,
          userId: null,
        })
        .returning();

      familyPersonId = familyPerson.id;

      // 2. Create basic profile record
      await db.insert(profiles).values({
        personId: familyPersonId,
        visibility: data.visibility || 'private',
      });
    }

    // 3. Create relationship record (from userPerson -> familyPerson)
    const inverseType = getInverseRelationship(data.relationshipType, data.gender);
    const [linkedPerson] = await db
      .select({ isLiving: people.isLiving, userId: people.userId })
      .from(people)
      .where(eq(people.id, familyPersonId));
    const canStoreUnclaimedDetails = linkedPerson?.isLiving === false && linkedPerson.userId === null;

    const [relationship] = await db
      .insert(personRelationships)
      .values({
        personAId: userPerson.id,
        personBId: familyPersonId,
        relationshipType: data.relationshipType,
        inverseRelationshipType: inverseType,
        notes: canStoreUnclaimedDetails ? data.notes || null : null,
        visibility: data.visibility || 'private',
        createdByUserId: userId,
      })
      .returning();

    // 4. Optionally connect place of origin for family member
    if (canStoreUnclaimedDetails && data.placeOfOrigin?.name && data.placeOfOrigin?.country) {
      await addPlaceConnection(userId, {
        name: data.placeOfOrigin.name,
        country: data.placeOfOrigin.country,
        stateRegion: data.placeOfOrigin.stateRegion,
        districtLga: data.placeOfOrigin.districtLga,
        townCity: data.placeOfOrigin.townCity,
        villageLocality: data.placeOfOrigin.villageLocality,
        placeType: data.placeOfOrigin.placeType,
        connectionType: 'origin',
        humanLabel: "Where they're from",
        forPersonId: familyPersonId,
      });
    }

    await recordActivityEvent(
      'FAMILY_MEMBER_ADDED',
      `Added family connection: ${data.firstName} ${data.lastName} (${data.relationshipType})`,
      userId,
      'person',
      familyPersonId
    );

    await recordActivityEvent(
      'RELATIONSHIP_CREATED',
      `Created relationship (${data.relationshipType}) with ${data.firstName} ${data.lastName}`,
      userId,
      'relationship',
      relationship.id
    );

    await consolidateFamilyConnections(userId);

    const [finalPerson] = await db.select().from(people).where(eq(people.id, familyPersonId));

    return {
      relationship,
      familyPerson: finalPerson,
    };
  } catch (error: any) {
    console.error('Database error in addFamilyMember:', error);
    throw new Error(error.message || 'Failed to add family member.', { cause: error });
  }
}

export async function updateFamilyRelationship(
  userId: number,
  relationshipId: number,
  data: {
    relationshipType?: RelationshipType;
    gender?: string | null;
    notes?: string | null;
    visibility?: VisibilitySetting;
  }
) {
  try {
    const [existing] = await db
      .select()
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.id, relationshipId),
          eq(personRelationships.createdByUserId, userId)
        )
      );

    if (!existing) {
      throw new Error('Relationship not found or permission denied');
    }

    const userPerson = await ensureUserPerson(userId, '');
    const relativePersonId = existing.personAId === userPerson.id ? existing.personBId : existing.personAId;
    const [relative] = await db.select().from(people).where(eq(people.id, relativePersonId));
    if (!relative) throw new Error('Family member record not found.');
    if (data.notes?.trim() && relative.isLiving && relative.userId === null) {
      throw new Error('Relationship notes can be added after this living relative claims their family record.');
    }

    const updates: any = {};
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.visibility !== undefined) updates.visibility = data.visibility;
    if (data.relationshipType) {
      updates.relationshipType = data.relationshipType;
      updates.inverseRelationshipType = getInverseRelationship(data.relationshipType);
    }

    if (data.gender !== undefined) {
      if (!relative || relative.userId !== null || relative.createdByUserId !== userId) {
        throw new Error('Only an unclaimed family profile you created can have its gender changed here.');
      }
      const supportedGenders = ['female', 'male', 'non_binary', 'another', 'unspecified'];
      if (data.gender !== null && !supportedGenders.includes(data.gender)) {
        throw new Error('Choose a supported gender option.');
      }
      await db.update(people)
        .set({ gender: data.gender === 'unspecified' ? null : data.gender })
        .where(eq(people.id, relativePersonId));
    }

    const [updated] = await db
      .update(personRelationships)
      .set(updates)
      .where(eq(personRelationships.id, relationshipId))
      .returning();

    await recordActivityEvent(
      'RELATIONSHIP_UPDATED',
      `Updated relationship #${relationshipId}`,
      userId,
      'relationship',
      relationshipId
    );

    return updated;
  } catch (error: any) {
    console.error('Database error in updateFamilyRelationship:', error);
    throw new Error(error.message || 'Failed to update relationship.', { cause: error });
  }
}

export async function removeRelationship(userId: number, relationshipIdOrPersonId: number) {
  try {
    const userPerson = await ensureUserPerson(userId, '');

    // 1. Try finding by relationship ID where user is creator or participant
    let [rel] = await db
      .select()
      .from(personRelationships)
      .where(
        and(
          eq(personRelationships.id, relationshipIdOrPersonId),
          or(
            eq(personRelationships.createdByUserId, userId),
            eq(personRelationships.personAId, userPerson.id),
            eq(personRelationships.personBId, userPerson.id)
          )
        )
      );

    // 2. If not found by relationship ID, check if argument was passed as other personId
    if (!rel) {
      const relsByPerson = await db
        .select()
        .from(personRelationships)
        .where(
          or(
            and(
              eq(personRelationships.personAId, userPerson.id),
              eq(personRelationships.personBId, relationshipIdOrPersonId)
            ),
            and(
              eq(personRelationships.personBId, userPerson.id),
              eq(personRelationships.personAId, relationshipIdOrPersonId)
            )
          )
        );
      if (relsByPerson.length > 0) {
        rel = relsByPerson[0];
      }
    }

    if (!rel) {
      throw new Error('Relationship not found or permission denied');
    }

    const otherPersonId = rel.personAId === userPerson.id ? rel.personBId : rel.personAId;

    // Delete the target relationship
    await db.delete(personRelationships).where(eq(personRelationships.id, rel.id));

    // Delete any reciprocal or secondary relationships connecting this user and the other person
    await db
      .delete(personRelationships)
      .where(
        or(
          and(
            eq(personRelationships.personAId, userPerson.id),
            eq(personRelationships.personBId, otherPersonId)
          ),
          and(
            eq(personRelationships.personBId, userPerson.id),
            eq(personRelationships.personAId, otherPersonId)
          )
        )
      );

    // If the other person was created by this user, has no other connections, and is not a registered user, clean it up
    const remainingRels = await db
      .select({ id: personRelationships.id })
      .from(personRelationships)
      .where(
        or(
          eq(personRelationships.personAId, otherPersonId),
          eq(personRelationships.personBId, otherPersonId)
        )
      );

    if (remainingRels.length === 0) {
      const [otherP] = await db.select().from(people).where(eq(people.id, otherPersonId));
      if (otherP && otherP.createdByUserId === userId && !otherP.userId) {
        await db.delete(personPlaces).where(eq(personPlaces.personId, otherPersonId));
        await db.delete(profiles).where(eq(profiles.personId, otherPersonId));
        await db.delete(people).where(eq(people.id, otherPersonId));
      }
    }

    await recordActivityEvent(
      'RELATIONSHIP_REMOVED',
      'Removed family connection',
      userId,
      'relationship',
      rel.id
    );

    return { success: true };
  } catch (error: any) {
    console.error('Database error in removeRelationship:', error);
    throw new Error(error.message || 'Failed to remove relationship.', { cause: error });
  }
}

// 8b. Family Invitations & Kinship Claiming
export async function createFamilyInvitation(
  userId: number,
  data: {
    personId: number;
    inviteeEmail: string;
    relationshipType: string;
  }
) {
  try {
    const person = await requireManageablePerson(userId, data.personId);
    if (person.createdByUserId !== userId || person.userId !== null) {
      throw new Error('Only an unclaimed family record you created can be invited.');
    }
    const [relationship] = await db
      .select({ relationshipType: personRelationships.relationshipType })
      .from(personRelationships)
      .where(and(
        eq(personRelationships.createdByUserId, userId),
        eq(personRelationships.personAId, (await ensureUserPerson(userId, '')).id),
        eq(personRelationships.personBId, data.personId)
      ));
    if (!relationship) throw new Error('This person is not in your family tree.');
    const inviteeEmail = data.inviteeEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail) || inviteeEmail.length > 254) {
      throw new Error('Enter a valid email address for the invited relative.');
    }

    // Show the high-entropy code once; only its hash is stored in PostgreSQL.
    const inviteCode = crypto.randomBytes(32).toString('base64url');
    const inviteCodeHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [invitation] = await db
      .insert(familyInvitations)
      .values({
        inviterUserId: userId,
        personId: data.personId,
        inviteeEmail,
        inviteCode: inviteCodeHash,
        relationshipType: relationship.relationshipType,
        status: 'pending',
        expiresAt,
      })
      .returning();

    await recordActivityEvent(
      'FAMILY_INVITATION_CREATED',
      `Created family invitation for ${person.firstName} ${person.lastName} (${data.relationshipType})`,
      userId,
      'person',
      person.id,
      { invitationId: invitation.id }
    );

    return {
      ...invitation,
      inviteCode,
      personName: `${person.firstName} ${person.lastName}`.trim(),
    };
  } catch (error: any) {
    console.error('Database error in createFamilyInvitation:', error);
    throw new Error(error.message || 'Failed to create family invitation.', { cause: error });
  }
}

export async function getFamilyInvitations(userId: number) {
  try {
    const invites = await db
      .select({
        id: familyInvitations.id,
        inviterUserId: familyInvitations.inviterUserId,
        personId: familyInvitations.personId,
        inviteeEmail: familyInvitations.inviteeEmail,
        inviteCode: familyInvitations.inviteCode,
        relationshipType: familyInvitations.relationshipType,
        status: familyInvitations.status,
        expiresAt: familyInvitations.expiresAt,
        createdAt: familyInvitations.createdAt,
        acceptedAt: familyInvitations.acceptedAt,
        personFirstName: people.firstName,
        personLastName: people.lastName,
        personGender: people.gender,
      })
      .from(familyInvitations)
      .innerJoin(people, eq(familyInvitations.personId, people.id))
      .where(eq(familyInvitations.inviterUserId, userId))
      .orderBy(desc(familyInvitations.createdAt));

    return invites.map((inv) => ({
      id: inv.id,
      inviterUserId: inv.inviterUserId,
      personId: inv.personId,
      personName: `${inv.personFirstName} ${inv.personLastName}`.trim(),
      inviteeEmail: inv.inviteeEmail,
      inviteCode: null,
      relationshipType: inv.relationshipType,
      gender: inv.personGender,
      status: inv.status as 'pending' | 'accepted' | 'expired' | 'revoked',
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
    }));
  } catch (error) {
    console.error('Database error in getFamilyInvitations:', error);
    throw new Error('Failed to load invitations.', { cause: error });
  }
}

async function ensureInvitationNotificationState(userId: number) {
  await db.insert(familyInvitationNotificationStates)
    .values({ userId })
    .onConflictDoNothing({ target: familyInvitationNotificationStates.userId });
  const [state] = await db.select().from(familyInvitationNotificationStates)
    .where(eq(familyInvitationNotificationStates.userId, userId));
  if (!state) throw new Error('Could not load invitation notification settings.');
  return state;
}

export async function getFamilyInvitationNotificationState(userId: number, verifiedEmail?: string | null) {
  const state = await ensureInvitationNotificationState(userId);
  const normalizedEmail = verifiedEmail?.trim().toLowerCase();
  const invitationScope = normalizedEmail
    ? or(
        eq(familyInvitations.inviterUserId, userId),
        and(eq(familyInvitations.inviteeEmail, normalizedEmail), ne(familyInvitations.inviterUserId, userId)),
      )
    : eq(familyInvitations.inviterUserId, userId);
  const [pending] = await db.select({ count: sql<number>`count(*)` })
    .from(familyInvitations)
    .where(and(
      invitationScope,
      eq(familyInvitations.status, 'pending'),
      sql`${familyInvitations.expiresAt} > now()`,
    ));
  const [groupPending] = await db.select({ count: sql<number>`count(*)` })
    .from(familyGroupInvitations)
    .where(and(
      eq(familyGroupInvitations.inviteeUserId, userId),
      eq(familyGroupInvitations.status, 'pending'),
      gt(familyGroupInvitations.expiresAt, new Date()),
    ));

  const sentClaimedActivity = and(
    eq(familyInvitations.inviterUserId, userId),
    eq(familyInvitations.status, 'accepted'),
    gt(familyInvitations.acceptedAt, state.activityReadAt),
  );
  const receivedInviteActivity = normalizedEmail
    ? and(
        eq(familyInvitations.inviteeEmail, normalizedEmail),
        ne(familyInvitations.inviterUserId, userId),
        eq(familyInvitations.status, 'pending'),
        gt(familyInvitations.createdAt, state.activityReadAt),
        sql`${familyInvitations.expiresAt} > now()`,
      )
    : undefined;
  const receivedGroupInviteActivity = and(
    eq(familyGroupInvitations.inviteeUserId, userId),
    eq(familyGroupInvitations.status, 'pending'),
    gt(familyGroupInvitations.createdAt, state.activityReadAt),
    gt(familyGroupInvitations.expiresAt, new Date()),
  );
  const [unread] = await db.select({ count: sql<number>`count(*)` })
    .from(familyInvitations)
    .where(receivedInviteActivity
      ? or(sentClaimedActivity, receivedInviteActivity)
      : sentClaimedActivity);
  const [groupUnread] = await db.select({ count: sql<number>`count(*)` })
    .from(familyGroupInvitations)
    .where(receivedGroupInviteActivity);

  return {
    pendingCount: Number(pending?.count || 0),
    groupsPendingCount: Number(groupPending?.count || 0),
    hasUnreadActivity: Number(unread?.count || 0) > 0 || Number(groupUnread?.count || 0) > 0,
    alertsEnabled: state.alertsEnabled,
  };
}

export async function markFamilyInvitationActivityRead(userId: number) {
  const now = new Date();
  await db.insert(familyInvitationNotificationStates)
    .values({ userId, activityReadAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: familyInvitationNotificationStates.userId,
      set: { activityReadAt: now, updatedAt: now },
    });
}

export async function setFamilyInvitationAlertsEnabled(userId: number, alertsEnabled: boolean) {
  const now = new Date();
  await db.insert(familyInvitationNotificationStates)
    .values({ userId, alertsEnabled, updatedAt: now })
    .onConflictDoUpdate({
      target: familyInvitationNotificationStates.userId,
      set: { alertsEnabled, updatedAt: now },
    });
}

export async function acceptFamilyInvitation(userId: number, inviteCode: string, verifiedEmail?: string | null) {
  try {
    const cleanCode = inviteCode.trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(cleanCode)) throw new Error('Invalid or expired invitation code.');
    if (!verifiedEmail) throw new Error('Sign in with a verified email account to accept this invitation.');
    const inviteHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const acceptedPersonId = await db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(familyInvitations)
        .where(and(
          or(eq(familyInvitations.inviteCode, inviteHash), eq(familyInvitations.inviteCode, cleanCode.toUpperCase())),
          eq(familyInvitations.status, 'pending')
        ))
        .for('update');
      if (!invitation || !invitation.inviteeEmail || invitation.inviteeEmail !== verifiedEmail.trim().toLowerCase()) {
        throw new Error('Invalid or expired invitation code.');
      }
      if (new Date() > new Date(invitation.expiresAt)) throw new Error('This invitation has expired.');

      const [familyPerson] = await tx.select().from(people).where(and(
        eq(people.id, invitation.personId),
        eq(people.createdByUserId, invitation.inviterUserId),
        isNull(people.userId)
      ));
      if (!familyPerson) throw new Error('This family record is no longer available to claim.');

      const [userPerson] = await tx.select().from(people).where(eq(people.userId, userId));
      const [inviterPerson] = await tx.select().from(people).where(eq(people.userId, invitation.inviterUserId));
      if (!userPerson || !inviterPerson) throw new Error('A family account record could not be found.');

      const now = new Date();
      await mergeClaimedPersonIntoAccount(tx, userId, familyPerson, userPerson, invitation.id);

      const [claimed] = await tx.update(familyInvitations).set({
        status: 'accepted',
        acceptedByUserId: userId,
        acceptedAt: now,
      }).where(and(
        eq(familyInvitations.id, invitation.id),
        eq(familyInvitations.status, 'pending')
      )).returning({ id: familyInvitations.id });
      if (!claimed) throw new Error('This invitation has already been used.');

      const inverseType = getInverseRelationship(invitation.relationshipType as RelationshipType);
      const [reciprocal] = await tx.select({ id: personRelationships.id }).from(personRelationships).where(and(
        eq(personRelationships.createdByUserId, userId),
        eq(personRelationships.personAId, familyPerson.id),
        eq(personRelationships.personBId, inviterPerson.id)
      ));
      if (!reciprocal) {
        await tx.insert(personRelationships).values({
          personAId: familyPerson.id,
          personBId: inviterPerson.id,
          relationshipType: inverseType,
          inverseRelationshipType: invitation.relationshipType,
          createdByUserId: userId,
          visibility: 'private',
        });
      }

      await tx.insert(activityEvents).values({
        eventType: 'FAMILY_INVITATION_ACCEPTED',
        summary: 'Accepted a family invitation',
        userId,
        targetType: 'person',
        targetId: familyPerson.id,
        metadata: JSON.stringify({ invitationId: invitation.id, inviterUserId: invitation.inviterUserId }),
      });
      return familyPerson.id;
    });

    await consolidateFamilyConnections(userId);
    return { success: true, personId: acceptedPersonId };
  } catch (error: any) {
    console.error('Database error in acceptFamilyInvitation:', error);
    throw new Error(error.message || 'Failed to accept invitation.', { cause: error });
  }
}

export async function connectRegisteredUserToPerson(
  userId: number,
  data: {
    personId: number;
    targetEmailOrCode: string;
  }
) {
  try {
    const input = data.targetEmailOrCode.trim();
    if (input.includes('@')) throw new Error('The account owner must accept a verified-email invitation before linking.');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(input)) throw new Error('Invalid or unaccepted invitation code.');
    const codeHash = crypto.createHash('sha256').update(input).digest('hex');
    const [invitation] = await db.select().from(familyInvitations).where(and(
      or(eq(familyInvitations.inviteCode, codeHash), eq(familyInvitations.inviteCode, input.toUpperCase())),
      eq(familyInvitations.inviterUserId, userId),
      eq(familyInvitations.personId, data.personId),
      eq(familyInvitations.status, 'accepted')
    ));
    if (!invitation?.acceptedByUserId) throw new Error('The relative must accept your invitation first.');
    const [person] = await db.select().from(people).where(and(
      eq(people.id, data.personId),
      eq(people.userId, invitation.acceptedByUserId),
      eq(people.createdByUserId, userId)
    ));
    if (!person) throw new Error('The accepted invitation is not linked to this family record.');
    const [linkedUser] = await db.select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users).where(eq(users.id, invitation.acceptedByUserId));
    if (!linkedUser) throw new Error('The accepted account could not be found.');
    return { success: true, personId: person.id, linkedUser };
  } catch (error: any) {
    console.error('Database error in connectRegisteredUserToPerson:', error);
    throw new Error(error.message || 'Failed to connect user.', { cause: error });
  }
}

export async function getKinshipDiscoverySuggestions(userId: number, verifiedEmail?: string | null) {
  try {
    const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
    const normalizedEmail = verifiedEmail?.trim().toLowerCase();
    if (!currentUser?.email || !normalizedEmail || currentUser.email.trim().toLowerCase() !== normalizedEmail) return [];
    const invites = await db
      .select({
        invitationId: familyInvitations.id,
        personId: familyInvitations.personId,
        inviterUserId: familyInvitations.inviterUserId,
        relationshipType: familyInvitations.relationshipType,
        personFirstName: people.firstName,
        personLastName: people.lastName,
        personGender: people.gender,
        inviterDisplayName: users.displayName,
      })
      .from(familyInvitations)
      .innerJoin(people, eq(familyInvitations.personId, people.id))
      .innerJoin(users, eq(familyInvitations.inviterUserId, users.id))
      .where(and(
        ilike(familyInvitations.inviteeEmail, normalizedEmail),
        eq(familyInvitations.status, 'pending'),
        sql`${familyInvitations.expiresAt} > now()`
      ));

    return Promise.all(invites.map(async (invite) => {
      const [treeCount] = await db.select({ count: sql<number>`count(*)` })
        .from(personRelationships).where(eq(personRelationships.createdByUserId, invite.inviterUserId));
      return {
        invitationId: invite.invitationId,
        personId: invite.personId,
        discoveredByUserId: invite.inviterUserId,
        discoveredByName: invite.inviterDisplayName || 'A GeoSmart member',
        suggestedRelationship: invite.relationshipType,
        suggestedGender: invite.personGender,
        personName: `${invite.personFirstName} ${invite.personLastName}`.trim(),
        matchReason: `A family invitation was sent to your verified email address.`,
        totalFamilyInNetwork: Number(treeCount?.count || 0),
      };
    }));
  } catch (error) {
    console.error('Database error in getKinshipDiscoverySuggestions:', error);
    throw new Error('Failed to check kinship discovery.', { cause: error });
  }
}

export async function claimDiscoveredPerson(userId: number, invitationId: number, verifiedEmail?: string | null) {
  try {
    if (!verifiedEmail) throw new Error('Sign in with a verified email account to accept this invitation.');
    const personId = await db.transaction(async (tx) => {
      const [invitation] = await tx.select().from(familyInvitations).where(and(
        eq(familyInvitations.id, invitationId),
        eq(familyInvitations.status, 'pending'),
        ilike(familyInvitations.inviteeEmail, verifiedEmail.trim())
      )).for('update');
      if (!invitation || new Date() > new Date(invitation.expiresAt)) throw new Error('Invitation not found or expired.');

      const [person] = await tx.select().from(people).where(and(
        eq(people.id, invitation.personId),
        eq(people.createdByUserId, invitation.inviterUserId),
        isNull(people.userId)
      ));
      if (!person) throw new Error('This family record is no longer available to claim.');

      const [userPerson] = await tx.select().from(people).where(eq(people.userId, userId));
      const [creatorPerson] = await tx.select().from(people).where(eq(people.userId, invitation.inviterUserId));
      if (!userPerson || !creatorPerson) throw new Error('A family account record could not be found.');

      await mergeClaimedPersonIntoAccount(tx, userId, person, userPerson, invitation.id);

      const [claimed] = await tx.update(familyInvitations).set({
        status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date(),
      }).where(and(
        eq(familyInvitations.id, invitation.id),
        eq(familyInvitations.status, 'pending')
      )).returning({ id: familyInvitations.id });
      if (!claimed) throw new Error('This invitation has already been used.');

      const inverseType = getInverseRelationship(invitation.relationshipType as RelationshipType);
      const [existing] = await tx.select({ id: personRelationships.id }).from(personRelationships).where(and(
        eq(personRelationships.createdByUserId, userId),
        eq(personRelationships.personAId, person.id),
        eq(personRelationships.personBId, creatorPerson.id)
      ));
      if (!existing) {
        await tx.insert(personRelationships).values({
          personAId: person.id,
          personBId: creatorPerson.id,
          relationshipType: inverseType,
          inverseRelationshipType: invitation.relationshipType,
          createdByUserId: userId,
          visibility: 'private',
        });
      }
      await tx.insert(activityEvents).values({
        eventType: 'FAMILY_INVITATION_ACCEPTED',
        summary: 'Accepted a family invitation',
        userId,
        targetType: 'person',
        targetId: person.id,
        metadata: JSON.stringify({ invitationId: invitation.id, inviterUserId: invitation.inviterUserId }),
      });
      return person.id;
    });

    await consolidateFamilyConnections(userId);

    // Keep this compatibility return shape for the current family UI.
    return { success: true, personId };
  } catch (error: any) {
    console.error('Database error in claimDiscoveredPerson:', error);
    throw new Error(error.message || 'Failed to claim family record.', { cause: error });
  }
}

export async function getFamilyStories(userId: number) {
  const family = await getUserFamily(userId);
  const connectedUserIds = [...new Set(family
    .map((member) => member.userId)
    .filter((linkedUserId): linkedUserId is number => Boolean(linkedUserId) && linkedUserId !== userId))];
  const visibilityFilter = connectedUserIds.length
    ? or(
        eq(familyStories.ownerUserId, userId),
        and(eq(familyStories.visibility, 'family'), inArray(familyStories.ownerUserId, connectedUserIds)),
      )
    : eq(familyStories.ownerUserId, userId);
  const stories = await db.select({
    id: familyStories.id,
    ownerUserId: familyStories.ownerUserId,
    ownerName: users.displayName,
    title: familyStories.title,
    description: familyStories.description,
    mediaType: familyStories.mediaType,
    contentType: familyStories.contentType,
    fileSize: familyStories.fileSize,
    visibility: familyStories.visibility,
    createdAt: familyStories.createdAt,
  })
    .from(familyStories)
    .innerJoin(users, eq(familyStories.ownerUserId, users.id))
    .where(visibilityFilter)
    .orderBy(desc(familyStories.createdAt));

  return stories.map((story) => ({
    ...story,
    ownerName: story.ownerName || 'Family member',
    mediaType: story.mediaType as 'audio' | 'video',
    visibility: story.visibility as 'private' | 'family',
    createdAt: story.createdAt.toISOString(),
    isOwner: story.ownerUserId === userId,
  }));
}

export async function createFamilyStory(userId: number, input: {
  title: string;
  description?: string | null;
  storagePath: string;
  contentType: string;
  mediaType: 'audio' | 'video';
  fileSize: number;
  visibility: 'private' | 'family';
  consentVersion: string;
}) {
  if (!input.storagePath.startsWith(`${userId}/`)) throw new Error('Invalid story storage path.');
  const person = await ensureUserPerson(userId, '');
  const [story] = await db.insert(familyStories).values({
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
  }).returning({ id: familyStories.id });

  await recordActivityEvent(
    'FAMILY_STORY_CREATED',
    `Added a ${input.mediaType} family story`,
    userId,
    'family_story',
    story.id,
    { visibility: input.visibility, consentVersion: input.consentVersion },
  );
  return { id: story.id };
}

export async function updateFamilyStorySharing(userId: number, storyId: number, visibility: 'private' | 'family') {
  const [story] = await db.select({ id: familyStories.id, visibility: familyStories.visibility })
    .from(familyStories)
    .where(and(eq(familyStories.id, storyId), eq(familyStories.ownerUserId, userId)));
  if (!story) throw new Error('Story not found or permission denied.');

  await db.update(familyStories)
    .set({
      visibility,
      ...(visibility === 'family' ? {
        consentVersion: 'family-story-consent-v1',
        consentConfirmedAt: new Date(),
      } : {}),
    })
    .where(eq(familyStories.id, storyId));

  if (story.visibility !== visibility) {
    await recordActivityEvent(
      'FAMILY_STORY_SHARING_UPDATED',
      visibility === 'family' ? 'Shared a family story with direct connections' : 'Made a family story private',
      userId,
      'family_story',
      storyId,
      { previous: story.visibility, selected: visibility },
    );
  }
  return { success: true, visibility };
}

export async function getFamilyStoryStoragePath(userId: number, storyId: number) {
  const [story] = await db.select().from(familyStories).where(eq(familyStories.id, storyId));
  if (!story) throw new Error('Story not found.');
  if (story.ownerUserId === userId) return story.storagePath;
  if (story.visibility !== 'family') throw new Error('You do not have access to this story.');

  const family = await getUserFamily(userId);
  const connectedUserIds = new Set(family.map((member) => member.userId).filter(Boolean));
  if (!connectedUserIds.has(story.ownerUserId)) throw new Error('You do not have access to this story.');
  return story.storagePath;
}

export async function deleteFamilyStory(userId: number, storyId: number) {
  const [story] = await db.select().from(familyStories).where(and(
    eq(familyStories.id, storyId),
    eq(familyStories.ownerUserId, userId),
  ));
  if (!story) throw new Error('Story not found or permission denied.');
  await deleteFamilyStoryObject(story.storagePath);
  await db.delete(familyStories).where(eq(familyStories.id, story.id));
  await recordActivityEvent('FAMILY_STORY_DELETED', 'Deleted a family story', userId, 'family_story', story.id);
  return { success: true };
}

// 9. Activity Event System
export async function recordActivityEvent(
  eventType: string,
  summary: string,
  userId?: number | null,
  targetType?: string,
  targetId?: number,
  metadata?: any
) {
  try {
    await db.insert(activityEvents).values({
      eventType,
      summary,
      userId: userId || null,
      targetType: targetType || null,
      targetId: targetId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    console.error('Failed to log activity event (non-fatal):', error);
  }
}

// 10. Data Control: Export My Data
export async function exportUserData(userId: number) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const person = await ensureUserPerson(userId, user?.email || '');
    const [profile] = await db.select().from(profiles).where(eq(profiles.personId, person.id));
    const family = await getUserFamily(userId);
    const placesList = await getUserPlaces(userId);
    const communitiesList = await getUserCommunities(userId);
    const stories = await db.select({
      id: familyStories.id,
      title: familyStories.title,
      description: familyStories.description,
      mediaType: familyStories.mediaType,
      contentType: familyStories.contentType,
      fileSize: familyStories.fileSize,
      visibility: familyStories.visibility,
      consentVersion: familyStories.consentVersion,
      consentConfirmedAt: familyStories.consentConfirmedAt,
      createdAt: familyStories.createdAt,
    }).from(familyStories).where(eq(familyStories.ownerUserId, userId));
    const userEvents = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId))
      .orderBy(desc(activityEvents.createdAt));

    const exportPayload = {
      product: 'GeoSmart',
      version: 'Phase 1 - Individual Relationship Foundation',
      exportTimestamp: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      person,
      profile,
      family,
      places: placesList,
      communities: communitiesList,
      familyStories: stories,
      activityLog: userEvents,
    };

    await recordActivityEvent(
      'DATA_EXPORTED',
      'User exported a personal data archive',
      userId,
      'user',
      userId
    );

    return exportPayload;
  } catch (error) {
    console.error('Database error in exportUserData:', error);
    throw new Error('Failed to generate personal data export.', { cause: error });
  }
}

// 11. Data Control: Delete My Account
export async function deleteUserAccount(userId: number) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    const stories = await db.select({ storagePath: familyStories.storagePath })
      .from(familyStories)
      .where(eq(familyStories.ownerUserId, userId));
    for (const story of stories) await deleteFamilyStoryObject(story.storagePath);

    // Record deletion only after private media objects have been removed.
    await recordActivityEvent(
      'ACCOUNT_DELETED',
      `User account ID ${userId} deleted by user request`,
      null,
      'user',
      userId
    );

    // Deleting from users cascades to people created by this user, relationships, profiles, places, etc.
    await db.delete(users).where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error('Database error in deleteUserAccount:', error);
    throw new Error('Failed to delete account.', { cause: error });
  }
}

// 12. Administration & Platform Health
export async function getAdminMetrics(adminUserId: number, reason: string) {
  try {
    const [adminUser] = await db.select().from(users).where(eq(users.id, adminUserId));
    if (!adminUser || adminUser.role !== 'admin') {
      throw new Error('Unauthorized administrative access');
    }

    const regUsersRes = await db.select({ count: sql<number>`count(*)` }).from(users);
    const activeUsersRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.status, 'active'));
    const familiesRes = await db.select({ count: sql<number>`count(*)` }).from(families);
    const relationshipsRes = await db.select({ count: sql<number>`count(*)` }).from(personRelationships);
    const activeFamilyTreesRes = await db
      .select({ count: sql<number>`count(distinct ${personRelationships.createdByUserId})` })
      .from(personRelationships);
    const invitationsRes = await db
      .select({
        total: sql<number>`count(*) filter (where ${familyInvitations.status} = 'pending' and ${familyInvitations.expiresAt} > now())`,
        accepted: sql<number>`count(*) filter (where ${familyInvitations.status} = 'accepted')`,
      })
      .from(familyInvitations);
    const communitiesRes = await db.select({ count: sql<number>`count(*)` }).from(communities);
    const placesRes = await db.select({ count: sql<number>`count(*)` }).from(places);
    const countriesRes = await db
      .select({ count: sql<number>`count(distinct ${places.country})` })
      .from(places);

    const totalRels = Number(relationshipsRes[0]?.count || 0);
    const activeTrees = Number(activeFamilyTreesRes[0]?.count || 0);
    const avgPerTree = activeTrees > 0 ? Math.round((totalRels / activeTrees) * 10) / 10 : 0;

    // Record audit log
    await recordAdminLog(
      adminUserId,
      adminUser.email,
      'VIEW_METRICS',
      reason || 'System overview dashboard check',
      'SUCCESS'
    );

    return {
      registeredUsers: Number(regUsersRes[0]?.count || 0),
      activeUsers: Number(activeUsersRes[0]?.count || 0),
      familiesCount: Number(familiesRes[0]?.count || 0),
      relationshipsCount: totalRels,
      activeFamilyTreesCount: activeTrees,
      averageFamilyTreeSize: avgPerTree,
      activeInvitationsCount: Number(invitationsRes[0]?.total || 0),
      claimedInvitationsCount: Number(invitationsRes[0]?.accepted || 0),
      communitiesCount: Number(communitiesRes[0]?.count || 0),
      placesCount: Number(placesRes[0]?.count || 0),
      countriesRepresented: Number(countriesRes[0]?.count || 0),
    };
  } catch (error) {
    console.error('Database error in getAdminMetrics:', error);
    throw new Error('Failed to load platform metrics.', { cause: error });
  }
}

export async function getAdminRecentActivity(limit = 20) {
  try {
    return await db
      .select()
      .from(activityEvents)
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Database error in getAdminRecentActivity:', error);
    throw new Error('Failed to load recent activity events.', { cause: error });
  }
}

export async function getAdminUsersList(searchQuery?: string) {
  try {
    // Only return minimal operational data: id, email, role, status, onboardingCompleted, createdAt
    let query = db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        onboardingCompleted: users.onboardingCompleted,
        createdAt: users.createdAt,
      })
      .from(users);

    if (searchQuery && searchQuery.trim()) {
      query = query.where(
        or(
          ilike(users.email, `%${searchQuery.trim()}%`),
          ilike(users.displayName, `%${searchQuery.trim()}%`)
        )
      ) as any;
    }

    const userList = await query.orderBy(desc(users.createdAt)).limit(50);
    return userList;
  } catch (error) {
    console.error('Database error in getAdminUsersList:', error);
    throw new Error('Failed to query users.', { cause: error });
  }
}

export async function adminUpdateUserStatus(
  adminUserId: number,
  targetUserId: number,
  status: 'active' | 'suspended',
  reason: string
) {
  try {
    const [admin] = await db.select().from(users).where(eq(users.id, adminUserId));
    if (!admin || admin.role !== 'admin') {
      throw new Error('Unauthorized administrative access');
    }

    const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!target) {
      throw new Error('Target user not found');
    }

    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, targetUserId));

    await recordAdminLog(
      adminUserId,
      admin.email,
      status === 'suspended' ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      reason,
      'SUCCESS',
      targetUserId,
      `GS-${10000 + targetUserId}`
    );

    return { success: true, status };
  } catch (error) {
    console.error('Database error in adminUpdateUserStatus:', error);
    throw new Error('Failed to update account status.', { cause: error });
  }
}

export async function getAdminLogs(limit = 50) {
  try {
    return await db
      .select()
      .from(adminAccessLogs)
      .orderBy(desc(adminAccessLogs.timestamp))
      .limit(limit);
  } catch (error) {
    console.error('Database error in getAdminLogs:', error);
    throw new Error('Failed to load administrative access logs.', { cause: error });
  }
}

export async function recordAdminLog(
  adminUserId: number,
  adminEmail: string,
  action: string,
  reason: string,
  result: 'SUCCESS' | 'DENIED' | 'ERROR',
  targetUserId?: number,
  targetAccountCode?: string
) {
  try {
    await db.insert(adminAccessLogs).values({
      adminUserId,
      adminEmail,
      action,
      reason,
      result,
      targetUserId: targetUserId || null,
      targetAccountCode: targetAccountCode || (targetUserId ? `GS-${10000 + targetUserId}` : null),
    });
  } catch (error) {
    console.error('Failed to log admin action (non-fatal):', error);
  }
}

// 13. Test / Demo Data Seeder (Section 35)
export async function seedDemoScenario(userId: number, scenario: 'local' | 'diaspora' | 'international' | 'multigen') {
  try {
    const userPerson = await ensureUserPerson(userId, '');

    if (scenario === 'local') {
      // Local user: Lives in Nigeria, family in Nigeria
      await addPlaceConnection(userId, {
        name: 'Lagos',
        country: 'Nigeria',
        connectionType: 'residence',
        humanLabel: 'Where I live',
        isCurrent: true,
      });
      await addPlaceConnection(userId, {
        name: 'Ibadan',
        country: 'Nigeria',
        connectionType: 'origin',
        humanLabel: "Where I'm from",
      });
      await addCommunityConnection(userId, {
        name: 'Ibadan Descendants Union',
        communityType: 'cultural_association',
        connectionType: 'origin',
        humanLabel: 'Hometown Association',
      });
      await addFamilyMember(userId, {
        firstName: 'Ade',
        lastName: userPerson.lastName,
        relationshipType: 'sibling',
        gender: 'male',
        notes: 'Lives in Lagos',
      });
    } else if (scenario === 'diaspora') {
      // Diaspora user: Lives in London UK, origin in Nigeria
      await addPlaceConnection(userId, {
        name: 'London',
        country: 'United Kingdom',
        connectionType: 'residence',
        humanLabel: 'Where I live',
        isCurrent: true,
      });
      await addPlaceConnection(userId, {
        name: 'Enugu',
        country: 'Nigeria',
        connectionType: 'origin',
        humanLabel: "Where I'm from",
      });
      await addPlaceConnection(userId, {
        name: 'Ngwo Village',
        country: 'Nigeria',
        placeType: 'village',
        connectionType: 'family_ancestral',
        humanLabel: 'Family/ancestral place',
      });
      await addCommunityConnection(userId, {
        name: 'Enugu State Association UK',
        communityType: 'diaspora',
        connectionType: 'member',
        humanLabel: 'UK Diaspora Chapter',
      });
      await addFamilyMember(userId, {
        firstName: 'Ngozi',
        lastName: userPerson.lastName,
        relationshipType: 'parent',
        gender: 'female',
        notes: 'Living in Enugu',
      });
    } else if (scenario === 'international') {
      // International marriage (Scenario E):
      // Person A lives in UK, from Nigeria
      // Person B lives in UK, from Ghana
      // Married spouses, child born in UK
      await addPlaceConnection(userId, {
        name: 'Manchester',
        country: 'United Kingdom',
        connectionType: 'residence',
        humanLabel: 'Where I live',
        isCurrent: true,
      });
      await addPlaceConnection(userId, {
        name: 'Benin City',
        country: 'Nigeria',
        connectionType: 'origin',
        humanLabel: "Where I'm from",
      });
      await addCommunityConnection(userId, {
        name: 'Edo Cultural Association Manchester',
        communityType: 'diaspora',
        connectionType: 'member',
        humanLabel: 'Diaspora Association',
      });

      // Add spouse from Ghana
      await addFamilyMember(userId, {
        firstName: 'Akosua',
        lastName: 'Mensah',
        relationshipType: 'spouse',
        gender: 'female',
        notes: 'Born and raised in Accra, Ghana',
        placeOfOrigin: {
          name: 'Accra',
          country: 'Ghana',
        },
      });

      // Add child born in UK
      await addFamilyMember(userId, {
        firstName: 'David',
        lastName: userPerson.lastName,
        relationshipType: 'child',
        gender: 'male',
        notes: 'Born in Manchester, UK',
        placeOfOrigin: {
          name: 'Manchester',
          country: 'United Kingdom',
        },
      });
    } else if (scenario === 'multigen') {
      // Multi-generation: Grandparent -> Parent -> User -> Child
      await addFamilyMember(userId, {
        firstName: 'Ezekiel',
        lastName: userPerson.lastName,
        relationshipType: 'grandparent',
        gender: 'male',
        isLiving: false,
        notes: 'Paternal grandfather',
      });
      await addFamilyMember(userId, {
        firstName: 'Samuel',
        lastName: userPerson.lastName,
        relationshipType: 'parent',
        gender: 'male',
        isLiving: true,
      });
      await addFamilyMember(userId, {
        firstName: 'Maya',
        lastName: userPerson.lastName,
        relationshipType: 'child',
        gender: 'female',
        isLiving: true,
      });
      await addPlaceConnection(userId, {
        name: 'Edinburgh',
        country: 'United Kingdom',
        connectionType: 'residence',
        humanLabel: 'Where I live',
        isCurrent: true,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Database error in seedDemoScenario:', error);
    throw new Error('Failed to load demo scenario.', { cause: error });
  }
}

// 26. Email & Password Authentication
export async function registerWithPassword(
  email: string,
  password: string,
  displayName?: string | null
) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`);

  if (existing.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  const uid = 'usr_' + crypto.randomUUID().replace(/-/g, '');
  const passwordHash = hashPassword(password);

  // Public email/password registration can never grant administrator access.
  const role = 'user';

  const [newUser] = await db
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail.split('@')[0],
      passwordHash,
      role,
      status: 'active',
      onboardingCompleted: false,
    })
    .returning();

  // Primary person & profile
  const nameParts = (displayName || normalizedEmail.split('@')[0]).trim().split(' ');
  const firstName = nameParts[0] || 'User';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Member';

  const [person] = await db
    .insert(people)
    .values({
      userId: newUser.id,
      firstName,
      lastName,
      createdByUserId: newUser.id,
    })
    .returning();

  await db.insert(profiles).values({
    personId: person.id,
    bio: '',
    visibility: 'private',
  });

  await recordActivityEvent(
    'USER_CREATED',
    `Account created for ${newUser.email}`,
    newUser.id,
    'user',
    newUser.id
  );

  const token = signAppToken({
    uid: newUser.uid,
    email: newUser.email,
    name: newUser.displayName,
  });

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
}

export async function loginWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`);

  if (existing.length === 0) {
    throw new Error('Invalid email or password.');
  }

  const user = existing[0];
  if (!user.passwordHash) {
    throw new Error('This account was registered using Google Sign-In. Please click "Continue with Google".');
  }

  if (user.status === 'suspended') {
    throw new Error('Account suspended. Please contact platform support.');
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password.');
  }

  const token = signAppToken({
    uid: user.uid,
    email: user.email,
    name: user.displayName,
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
    },
    token,
  };
}
