# GeoSmart Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Verified Identity Ownership**: Every user-owned document in `/users/{uid}` and its subcollections (`places`, `communities`, `familyMembers`, `activityEvents`, `stories`) MUST belong to a verified Firebase Auth user (`request.auth != null && request.auth.token.email_verified == true`), and `ownerUid`/`uid` MUST strictly equal `request.auth.uid`.
2. **PII Isolation**: `/users/{uid}` (containing `email` and private bio/settings) is strictly restricted to the owning user (`isOwner(uid)`) or platform admins (`isAdmin()`). Cross-user family sharing reads ONLY non-PII `/sharedProfiles/{uid}` and ONLY when `visibility` is `'shared'` or `'public'`. Blanket `allow list` on `/sharedProfiles` is denied.
3. **Role & Account Status Hardening**: Users CANNOT self-assign `role: 'admin'` on creation (unless verified as the trusted bootstrapped admin or listed in `/admins/{uid}`), and CANNOT alter `role` or `status` during updates. Only verified admins can suspend or reactivate accounts.
4. **Master Gate**: Every subcollection under `/users/{uid}/*` MUST enforce parent `/users/{uid}` existence via `exists(...)` on single-document operations (`get`, `create`, `update`, `delete`), while `list` operations validate `resource.data.ownerUid == request.auth.uid` directly without `get()`/`exists()` cost explosions.
5. **Path & Payload Poisoning Protection**: Every document ID (`uid`, `placeId`, `communityId`, `memberId`, `eventId`, `storyId`, `inviteId`, `logId`) MUST satisfy `^[a-zA-Z0-9_-]+$` and `size() <= 128`. Every string field enforces strict `.size()` bounds. No `JSON.stringify` shadow strings; strict key checks (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).
6. **Temporal Integrity & Immutability**: `createdAt` MUST equal `request.time` on create and remain immutable on update. `updatedAt` MUST equal `request.time` on create and update. `uid`, `ownerUid`, `id`, `numericId`, and `inviterUid` are immutable.
7. **Invitation Terminal State & Atomic Linking**:
   - Plain invitation codes are never stored; only 64-char SHA-256 hex `inviteCodeHash`.
   - `/familyInvitations/{inviteId}` can only be read or listed by `inviterUid == auth.uid` OR verified invitee (`inviteeEmail == auth.token.email.lower()`).
   - Once `status` reaches `'accepted'`, `'expired'`, or `'revoked'`, non-admins CANNOT modify the invitation.
   - Accepting an invitation transitions `status` `'pending' -> 'accepted'` and atomically links `/users/{inviterUid}/familyMembers/{memberId}` ONLY when `getAfter()` proves the matching invitation transitioned to `'accepted'` with `acceptedByUid == request.auth.uid`.

8. **Invite-Only Family Groups & Discussions**:
   - Only the group organiser (`organizerUid == request.auth.uid`) or accepted members (`request.auth.uid in memberUids`) can read `/familyGroups/{groupId}`, `/familyGroups/{groupId}/members/{memberUid}`, `/familyGroups/{groupId}/posts/{postId}`, or `/familyGroups/{groupId}/posts/{postId}/comments/{commentId}`.
   - Pending or declined invitees on `/familyGroupInvitations/{inviteId}` are synchronously blocked from reading or writing group discussions.
   - `memberUids` is strictly bounded (`1 <= size <= 50`) and updated atomically alongside `/familyGroupInvitations/{groupId}__{uid}` and `/familyGroups/{groupId}/members/{uid}`.
9. **Private & Family-Shared Story Media Isolation**:
   - `/users/{uid}/stories/{storyId}` is strictly owner-only (or admin), and `storagePath` must match `<uid>/<objectId>` (`^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+$`) and remain immutable.
   - `/sharedFamilyStories/{storyId}` exists ONLY while the owner's `/users/{uid}/stories/{storyId}.visibility == 'family'`, enforced atomically via `getAfter()` on share and `!existsAfter()` when set back to `'private'`. Access is restricted to `allowedUids` (`1 <= size <= 50`).
   - Backend media streaming (`/api/family/stories/:storyId/media`) verifies the caller's Firebase ID token (`email_verified == true`) and checks story access against Firestore Security Rules via the caller's token before signing Supabase Storage URLs.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation (Self-Admin Create)**: Creating `/users/{uid}` with `role: 'admin'` as a normal user → `PERMISSION_DENIED`.
2. **Privilege Escalation (Role/Status Tamper Update)**: Updating `/users/{uid}` with `role: 'admin'` or changing `status: 'suspended'` back to `'active'` → `PERMISSION_DENIED`.
3. **Shadow Update / Ghost Field Injection**: Updating `/users/{uid}/places/{placeId}` with an extra undocumented field `{ name: 'Lagos', isVerified: true }` → `PERMISSION_DENIED`.
4. **Cross-Tenant Ownership Spoofing**: Creating `/users/victimUid/places/p1` or `/users/attackerUid/places/p1` with `ownerUid: 'victimUid'` → `PERMISSION_DENIED`.
5. **Email Spoofing Without Verification**: Accessing protected records or bootstrap admin actions with `email: 'alphaonesolutionsltd@gmail.com'` and `email_verified: false` → `PERMISSION_DENIED`.
6. **PII Blanket / Cross-User Read**: Reading `/users/otherUid` directly or listing `/sharedProfiles` → `PERMISSION_DENIED`.
7. **Private SharedProfile Leak**: Reading `/sharedProfiles/otherUid` when `visibility == 'private'` → `PERMISSION_DENIED`.
8. **Path Poisoning (1KB+ or Special-Char ID)**: Creating `/users/{uid}/places/../../../admin` or a 200-char ID → `PERMISSION_DENIED`.
9. **Value Poisoning / Denial of Wallet**: Creating or updating a place with a 50KB `notes` string or wrong type (`isCurrent: 'yes'`) → `PERMISSION_DENIED`.
10. **Invitation State Shortcutting**: Updating `/familyInvitations/{inviteId}` from `'accepted'` back to `'pending'`, or accepting an invitation addressed to a different email → `PERMISSION_DENIED`.
11. **Unlinked Batch Spoof (Atomicity Bypass)**: Updating `/users/{inviterUid}/familyMembers/{memberId}.linkedUid` without an atomic `getAfter` accepted invitation, or reading/posting in `/familyGroups/{groupId}/posts` as a pending/declined invitee → `PERMISSION_DENIED`.
12. **Client Timestamp / Immortal Field Tampering**: Creating a record with backdated `createdAt`, or altering `createdAt`/`inviterUid` on update, or deleting an immutable `/adminLogs/{logId}` → `PERMISSION_DENIED`.
