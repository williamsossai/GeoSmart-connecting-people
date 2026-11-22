export type RelationshipType = 
  | 'parent' 
  | 'child' 
  | 'spouse' 
  | 'sibling' 
  | 'grandparent' 
  | 'grandchild' 
  | 'relative' 
  | 'other';

export type PlaceConnectionType = 
  | 'residence' 
  | 'origin' 
  | 'family_ancestral' 
  | 'birthplace' 
  | 'work' 
  | 'study' 
  | 'other';

export type CommunityType = 
  | 'hometown' 
  | 'village' 
  | 'town' 
  | 'local' 
  | 'diaspora' 
  | 'cultural_association' 
  | 'other';

export type CommunityConnectionType = 
  | 'resident' 
  | 'member' 
  | 'origin' 
  | 'ancestral_connection' 
  | 'family_connection' 
  | 'marriage_connection' 
  | 'professional' 
  | 'other';

export type VisibilitySetting = 'private' | 'shared' | 'public';

export interface FamilyStorySummary {
  id: number;
  ownerUserId: number;
  ownerName: string;
  title: string;
  description: string | null;
  mediaType: 'audio' | 'video';
  contentType: string;
  fileSize: number;
  visibility: 'private' | 'family';
  createdAt: string;
  isOwner: boolean;
}

export interface UserSummary {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface PersonRecord {
  id: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: string | null;
  birthDate: string | null;
  isLiving: boolean;
  createdByUserId: number;
}

export interface ProfileRecord {
  id: number;
  personId: number;
  bio: string | null;
  currentResidenceSummary: string | null;
  originSummary: string | null;
  avatarUrl: string | null;
  visibility: VisibilitySetting;
}

export interface FamilyMemberWithPerson {
  relationshipId: number;
  personId: number;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  relationshipType: RelationshipType;
  inverseRelationshipType?: string | null;
  notes?: string | null;
  gender?: string | null;
  isLiving: boolean;
  placesCount?: number;
  userId?: number | null;
  hasAccount?: boolean;
  userEmail?: string | null;
  userDisplayName?: string | null;
  visibility?: VisibilitySetting;
  placeOfOrigin?: { name: string; country: string } | null;
  originSummary?: string | null;
  currentResidenceSummary?: string | null;
}

export interface FamilyTreeNode {
  personId: number;
  relationshipId?: number;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender?: string | null;
  relationshipType: RelationshipType | 'self';
  generation: number;
  generationLabel: string;
  isSelf: boolean;
  isLiving: boolean;
  hasAccount: boolean;
  userId?: number | null;
  userEmail?: string | null;
  userDisplayName?: string | null;
  notes?: string | null;
  placeOfOrigin?: string | null;
  placesCount?: number;
  visibility?: VisibilitySetting;
}

export interface FamilyTreeSummary {
  totalMembers: number;
  generationsCount: number;
  membersWithAccounts: number;
  placesCount: number;
  placesList: Array<{ name: string; country: string }>;
}

export interface FamilyTreeGraph {
  self: FamilyTreeNode;
  nodes: FamilyTreeNode[];
  generations: Record<number, FamilyTreeNode[]>;
  summary: FamilyTreeSummary;
}

export interface FamilyInvitationRecord {
  id: number;
  inviterUserId: number;
  inviterName?: string;
  personId: number;
  personName: string;
  inviteeEmail: string | null;
  inviteCode: string | null;
  relationshipType: string;
  gender?: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface KinshipDiscoveryMatch {
  invitationId: number;
  inviteCode?: string;
  personId: number;
  discoveredByUserId: number;
  discoveredByName: string;
  suggestedRelationship: string;
  suggestedGender?: string | null;
  personName: string;
  matchReason: string;
  totalFamilyInNetwork: number;
}

export interface PlaceWithConnection {
  id: number;
  connectionId: number;
  name: string;
  country: string;
  stateRegion: string | null;
  districtLga: string | null;
  townCity: string | null;
  villageLocality: string | null;
  placeType: string;
  connectionType: PlaceConnectionType;
  humanLabel: string | null;
  isCurrent: boolean;
  notes: string | null;
  visibility: VisibilitySetting;
}

export interface CommunityWithConnection {
  id: number;
  connectionId: number;
  name: string;
  communityType: CommunityType;
  description: string | null;
  associatedPlaceId: number | null;
  associatedPlaceName?: string | null;
  associatedPlaceCountry?: string | null;
  connectionType: CommunityConnectionType;
  humanLabel: string | null;
  notes: string | null;
  visibility: VisibilitySetting;
}

export interface GeoSmartOverview {
  user: UserSummary;
  person: PersonRecord;
  profile: ProfileRecord;
  stats: {
    countriesCount: number;
    placesCount: number;
    communitiesCount: number;
    familyCount: number;
  };
  recentActivity: Array<{
    id: number;
    summary: string;
    createdAt: string;
  }>;
  privacyHistory: Array<{
    id: number;
    previous: VisibilitySetting;
    selected: VisibilitySetting;
    scope: 'Profile' | 'Place';
    createdAt: string;
  }>;
}

export interface AdminPlatformMetrics {
  registeredUsers: number;
  activeUsers: number;
  familiesCount: number;
  relationshipsCount: number;
  communitiesCount: number;
  placesCount: number;
  countriesRepresented: number;
}

export interface AdminHealthStatus {
  database: 'healthy' | 'degraded' | 'error';
  dbLatencyMs: number;
  authService: 'healthy' | 'degraded';
  serverUptimeSeconds: number;
  recentErrorCount: number | null;
  timestamp: string;
}

export interface AdminAccessLogEntry {
  id: number;
  adminUserId: number;
  adminEmail: string;
  action: string;
  targetUserId: number | null;
  targetAccountCode: string | null;
  reason: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  timestamp: string;
}
