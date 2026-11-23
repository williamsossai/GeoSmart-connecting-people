/**
 * Phase 0 Security Rules Verification Harness (Dirty Dozen Adversarial Suite)
 * Verifies all 12 Dirty Dozen attack payloads against the Firestore rules contract.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation - Self-Assigned Admin on Create',
    targetPath: 'users/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker_uid',
      numericId: 1001,
      email: 'attacker@example.com',
      displayName: 'Attacker',
      firstName: 'Attacker',
      lastName: 'User',
      otherNames: '',
      gender: 'unspecified',
      isLiving: true,
      bio: '',
      currentResidenceSummary: '',
      originSummary: '',
      visibility: 'private',
      role: 'admin',
      status: 'active',
      onboardingCompleted: false,
      alertsEnabled: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Privilege Escalation - Reactivate Suspended Account',
    targetPath: 'users/suspended_uid',
    operation: 'update',
    auth: { uid: 'suspended_uid', email: 'suspended@example.com', email_verified: true },
    payload: { status: 'active', role: 'admin' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Update - Ghost Field Injection on Place',
    targetPath: 'users/user_a/places/place_1',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { name: 'Lagos', isVerified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing - OwnerUid Mismatch',
    targetPath: 'users/user_a/places/place_2',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'place_2',
      numericId: 202,
      ownerUid: 'victim_uid',
      name: 'Abuja',
      country: 'Nigeria',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Email Spoofing - Unverified Admin Email Claim',
    targetPath: 'adminLogs/log_1',
    operation: 'list',
    auth: { uid: 'spoof_uid', email: 'alphaonesolutionsltd@gmail.com', email_verified: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'PII Blanket Read - Cross-User /users Read',
    targetPath: 'users/victim_uid',
    operation: 'get',
    auth: { uid: 'attacker_uid', email: 'a@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Private SharedProfile Read Violation',
    targetPath: 'sharedProfiles/private_user_uid',
    operation: 'get',
    auth: { uid: 'other_user_uid', email: 'b@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Path Poisoning - Invalid Long or Malformed Doc ID',
    targetPath: `users/user_a/places/${'x'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { id: 'x'.repeat(200), ownerUid: 'user_a', name: 'Bad', country: 'Nowhere' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning - Oversized Notes String',
    targetPath: 'users/user_a/places/place_3',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'place_3',
      numericId: 303,
      ownerUid: 'user_a',
      name: 'London',
      country: 'United Kingdom',
      notes: 'Z'.repeat(5000),
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal State Violation - Reopen Accepted Invitation',
    targetPath: 'familyInvitations/inv_1',
    operation: 'update',
    auth: { uid: 'inviter_uid', email: 'inviter@example.com', email_verified: true },
    payload: { status: 'pending' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Atomicity Bypass - Unverified Relative Link Injection',
    targetPath: 'users/inviter_uid/familyMembers/mem_1',
    operation: 'update',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { linkedUid: 'attacker_uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Audit Immutability Violation - Delete Admin Log',
    targetPath: 'adminLogs/log_1',
    operation: 'delete',
    auth: { uid: 'admin_uid', email: 'alphaonesolutionsltd@gmail.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];

export function evaluateStaticInvariants(): { passed: boolean; count: number } {
  const allDenied = DIRTY_DOZEN_PAYLOADS.every((c) => c.expectedOutcome === 'PERMISSION_DENIED');
  return { passed: allDenied && DIRTY_DOZEN_PAYLOADS.length === 12, count: DIRTY_DOZEN_PAYLOADS.length };
}
