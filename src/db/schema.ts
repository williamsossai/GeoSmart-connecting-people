import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Users table (account authentication and role management)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or internal account UID
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  status: text('status').notNull().default('active'), // 'active' | 'suspended'
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. People table (human beings in the system, either with user account or recorded family connections)
export const people = pgTable('people', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }), // Linked user account if registered
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  otherNames: text('other_names'),
  gender: text('gender'),
  birthDate: text('birth_date'),
  isLiving: boolean('is_living').notNull().default(true),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. Profiles table (person's narrative profile)
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  personId: integer('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  bio: text('bio'),
  currentResidenceSummary: text('current_residence_summary'),
  originSummary: text('origin_summary'),
  avatarUrl: text('avatar_url'),
  visibility: text('visibility').notNull().default('private'), // 'private' | 'shared' | 'public'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Person Relationships (structural connections between two people)
export const personRelationships = pgTable('person_relationships', {
  id: serial('id').primaryKey(),
  personAId: integer('person_a_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  personBId: integer('person_b_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  relationshipType: text('relationship_type').notNull(), // 'parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'relative', 'other'
  inverseRelationshipType: text('inverse_relationship_type'),
  notes: text('notes'),
  visibility: text('visibility').notNull().default('private'),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. Families (family groups/units)
export const families = pgTable('families', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  visibility: text('visibility').notNull().default('private'),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Family Members
export const familyMembers = pgTable('family_members', {
  id: serial('id').primaryKey(),
  familyId: integer('family_id')
    .references(() => families.id, { onDelete: 'cascade' })
    .notNull(),
  personId: integer('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  roleInFamily: text('role_in_family'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

// 7. Places (geographic locations)
export const places = pgTable('places', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  stateRegion: text('state_region'),
  districtLga: text('district_lga'),
  townCity: text('town_city'),
  villageLocality: text('village_locality'),
  placeType: text('place_type').notNull().default('town'), // 'country', 'region', 'district', 'town', 'village'
  latitude: text('latitude'),
  longitude: text('longitude'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Person Places (relationships between people and geographic places)
export const personPlaces = pgTable('person_places', {
  id: serial('id').primaryKey(),
  personId: integer('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  placeId: integer('place_id')
    .references(() => places.id, { onDelete: 'cascade' })
    .notNull(),
  connectionType: text('connection_type').notNull(), // 'residence', 'origin', 'family_ancestral', 'birthplace', 'work', 'study', 'other'
  humanLabel: text('human_label'), // e.g. "Where I live", "Where I'm from", "Family place"
  isCurrent: boolean('is_current').notNull().default(false),
  notes: text('notes'),
  visibility: text('visibility').notNull().default('private'),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Communities (cultural, town, diaspora, or affinity groups)
export const communities = pgTable('communities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  communityType: text('community_type').notNull().default('hometown'), // 'hometown', 'village', 'town', 'local', 'diaspora', 'cultural_association', 'other'
  description: text('description'),
  associatedPlaceId: integer('associated_place_id').references(() => places.id, { onDelete: 'set null' }),
  visibility: text('visibility').notNull().default('private'),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. Person Communities (relationships between people and communities)
export const personCommunities = pgTable('person_communities', {
  id: serial('id').primaryKey(),
  personId: integer('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  communityId: integer('community_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  connectionType: text('connection_type').notNull(), // 'resident', 'member', 'origin', 'ancestral_connection', 'family_connection', 'marriage_connection', 'professional', 'other'
  humanLabel: text('human_label'),
  notes: text('notes'),
  visibility: text('visibility').notNull().default('private'),
  createdByUserId: integer('created_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. Activity Event System
export const activityEvents = pgTable('activity_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(), // e.g. 'USER_CREATED', 'PROFILE_UPDATED', 'FAMILY_MEMBER_ADDED', etc.
  userId: integer('user_id'),
  targetType: text('target_type'),
  targetId: integer('target_id'),
  summary: text('summary').notNull(),
  metadata: text('metadata'), // JSON string
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 12. Admin Access Logs (Audit for operational accountability)
export const adminAccessLogs = pgTable('admin_access_logs', {
  id: serial('id').primaryKey(),
  adminUserId: integer('admin_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  targetUserId: integer('target_user_id'),
  targetAccountCode: text('target_account_code'),
  reason: text('reason').notNull(),
  result: text('result').notNull(), // 'SUCCESS' | 'DENIED' | 'ERROR'
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// 13. Family Invitations (for inviting and claiming family tree member records)
export const familyInvitations = pgTable('family_invitations', {
  id: serial('id').primaryKey(),
  inviterUserId: integer('inviter_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  personId: integer('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  inviteeEmail: text('invitee_email'),
  inviteCode: text('invite_code').notNull().unique(),
  relationshipType: text('relationship_type').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'expired' | 'revoked'
  acceptedByUserId: integer('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at'),
});

// 14. Per-user invitation notification preferences and activity read cursor
export const familyInvitationNotificationStates = pgTable('family_invitation_notification_states', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  alertsEnabled: boolean('alerts_enabled').notNull().default(true),
  activityReadAt: timestamp('activity_read_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Private media stories shared by an account and, when explicitly enabled, its direct family connections.
export const familyStories = pgTable('family_stories', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  personId: integer('person_id').references(() => people.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  storagePath: text('storage_path').notNull().unique(),
  contentType: text('content_type').notNull(),
  mediaType: text('media_type').notNull(), // 'audio' | 'video'
  fileSize: integer('file_size').notNull(),
  visibility: text('visibility').notNull().default('private'), // 'private' | 'family'
  consentVersion: text('consent_version').notNull(),
  consentConfirmedAt: timestamp('consent_confirmed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations declarations
export const usersRelations = relations(users, ({ one, many }) => ({
  person: one(people, {
    fields: [users.id],
    references: [people.userId],
  }),
  createdPeople: many(people),
  createdFamilies: many(families),
  createdRelationships: many(personRelationships),
  createdPlaces: many(personPlaces),
  createdCommunities: many(communities),
  adminLogs: many(adminAccessLogs),
  sentInvitations: many(familyInvitations, { relationName: 'inviter' }),
  acceptedInvitations: many(familyInvitations, { relationName: 'acceptedUser' }),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(users, {
    fields: [people.userId],
    references: [users.id],
  }),
  profile: one(profiles, {
    fields: [people.id],
    references: [profiles.personId],
  }),
  familyMemberships: many(familyMembers),
  relationshipsAsA: many(personRelationships, { relationName: 'personA' }),
  relationshipsAsB: many(personRelationships, { relationName: 'personB' }),
  personPlaces: many(personPlaces),
  personCommunities: many(personCommunities),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  person: one(people, {
    fields: [profiles.personId],
    references: [people.id],
  }),
}));

export const familiesRelations = relations(families, ({ many, one }) => ({
  members: many(familyMembers),
  creator: one(users, {
    fields: [families.createdByUserId],
    references: [users.id],
  }),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  family: one(families, {
    fields: [familyMembers.familyId],
    references: [families.id],
  }),
  person: one(people, {
    fields: [familyMembers.personId],
    references: [people.id],
  }),
}));

export const placesRelations = relations(places, ({ many }) => ({
  personPlaces: many(personPlaces),
  communities: many(communities),
}));

export const personPlacesRelations = relations(personPlaces, ({ one }) => ({
  person: one(people, {
    fields: [personPlaces.personId],
    references: [people.id],
  }),
  place: one(places, {
    fields: [personPlaces.placeId],
    references: [places.id],
  }),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  associatedPlace: one(places, {
    fields: [communities.associatedPlaceId],
    references: [places.id],
  }),
  personCommunities: many(personCommunities),
}));

export const personCommunitiesRelations = relations(personCommunities, ({ one }) => ({
  person: one(people, {
    fields: [personCommunities.personId],
    references: [people.id],
  }),
  community: one(communities, {
    fields: [personCommunities.communityId],
    references: [communities.id],
  }),
}));

export const familyInvitationsRelations = relations(familyInvitations, ({ one }) => ({
  inviter: one(users, {
    fields: [familyInvitations.inviterUserId],
    references: [users.id],
    relationName: 'inviter',
  }),
  person: one(people, {
    fields: [familyInvitations.personId],
    references: [people.id],
  }),
  acceptedUser: one(users, {
    fields: [familyInvitations.acceptedByUserId],
    references: [users.id],
    relationName: 'acceptedUser',
  }),
}));
