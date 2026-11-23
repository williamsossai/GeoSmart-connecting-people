import React, { useEffect, useMemo, useState } from 'react';
import { FolderHeart, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useAuth } from './AuthContext.tsx';
import type { FamilyMemberWithPerson, RelationshipType } from '../types.ts';
import { getRelationshipLabel } from '../lib/family-relationships.ts';
import { notifyInvitationNotificationsChanged } from './InvitationNotificationsContext.tsx';

interface FamilyGroupMember {
  userId: number;
  name: string;
  personId: number | null;
  relationshipType: string;
  joinedAt: string;
  status: 'pending' | 'accepted';
  isOrganizer: boolean;
  isCurrentUser: boolean;
}

interface FamilyGroup {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  members: FamilyGroupMember[];
  isOwner: boolean;
}

interface GroupInvitation {
  id: number;
  groupId: number;
  groupName: string;
  groupDescription: string | null;
  inviterUserId: number;
  inviterName: string;
  createdAt: string;
  expiresAt: string;
}

interface GroupComment {
  id: number;
  body: string;
  authorUserId: number;
  authorName: string;
  createdAt: string;
}

interface GroupPost {
  id: number;
  body: string;
  authorUserId: number;
  authorName: string;
  createdAt: string;
  comments: GroupComment[];
}

export const FamilyGroupsView: React.FC = () => {
  const { idToken } = useAuth();
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [inviteConfirmed, setInviteConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [inviteSelections, setInviteSelections] = useState<Record<number, string>>({});
  const [invitingGroupId, setInvitingGroupId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [changingMemberUserId, setChangingMemberUserId] = useState<number | null>(null);

  const load = async () => {
    if (!idToken) {
      setLoading(false);
      setLoadError('A verified connection is needed to manage family groups.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const headers = { Authorization: `Bearer ${idToken}` };
      const [groupsResponse, familyResponse, invitationsResponse] = await Promise.all([
        fetch('/api/family/groups', { headers }),
        fetch('/api/family', { headers }),
        fetch('/api/family/groups/invitations', { headers }),
      ]);
      const [groupsData, familyData, invitationsData] = await Promise.all([
        groupsResponse.json().catch(() => ({})),
        familyResponse.json().catch(() => ({})),
        invitationsResponse.json().catch(() => ({})),
      ]);
      if (!groupsResponse.ok) throw new Error(groupsData.error || 'Could not load your family groups.');
      if (!familyResponse.ok) throw new Error(familyData.error || 'Could not load family connections for group selection.');
      if (!invitationsResponse.ok) throw new Error(invitationsData.error || 'Could not load group invitations.');
      setGroups(Array.isArray(groupsData) ? groupsData : []);
      setFamilyMembers(Array.isArray(familyData) ? familyData : []);
      setInvitations(Array.isArray(invitationsData) ? invitationsData : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your family groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [idToken]);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;

  useEffect(() => {
    if (activeGroupId === null && editingGroupId === null && !showForm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!saving) setShowForm(false);
        if (!savingEdit) setEditingGroupId(null);
        if (!saving) setActiveGroupId(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeGroupId, editingGroupId, showForm, saving, savingEdit]);

  const loadPosts = async (groupId: number) => {
    if (!idToken) return;
    setPostsLoading(true);
    try {
      const response = await fetch(`/api/family/groups/${groupId}/posts`, { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load the group discussion.');
      setPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the group discussion.');
    } finally {
      setPostsLoading(false);
    }
  };

  useEffect(() => {
    if (activeGroupId !== null) void loadPosts(activeGroupId);
    else setPosts([]);
  }, [activeGroupId, idToken]);

  const groupedByRelationship = useMemo(() => {
    const sections = new Map<string, FamilyMemberWithPerson[]>();
    for (const person of familyMembers.filter((member) => Boolean(member.userId))) {
      const label = getRelationshipLabel(person.relationshipType as RelationshipType, person.gender);
      sections.set(label, [...(sections.get(label) || []), person]);
    }
    return [...sections.entries()];
  }, [familyMembers]);

  const toggleMember = (personId: number) => {
    setSelectedIds((current) => current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]);
  };

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!idToken) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/family/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name, description, personIds: selectedIds, inviteConfirmed }),
      });
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json().catch(() => ({})) : {};
      if (!response.ok) {
        const fallback = isJson
          ? 'Could not create this group.'
          : `The server returned an unexpected response (HTTP ${response.status}). Restart GeoSmart on port 3001 to load the family groups API.`;
        throw new Error(data.error || fallback);
      }
      setName('');
      setDescription('');
      setSelectedIds([]);
      setInviteConfirmed(false);
      setShowForm(false);
      setNotice('Group created. Invitations were sent; invitees can access and interact after they accept.');
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create this group.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (group: FamilyGroup) => {
    if (!idToken || !window.confirm(`Delete “${group.name}”? This removes the group only; family connections remain in your tree.`)) return;
    setDeletingId(group.id);
    setNotice(null);
    setLoadError(null);
    try {
      const response = await fetch(`/api/family/groups/${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete this group.');
      setGroups((current) => current.filter((item) => item.id !== group.id));
      if (activeGroupId === group.id) setActiveGroupId(null);
      setNotice(`“${group.name}” was deleted. Its family connections remain in your tree.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not delete this group.');
    } finally {
      setDeletingId(null);
    }
  };

  const beginRename = (group: FamilyGroup) => {
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditDescription(group.description || '');
    setLoadError(null);
  };

  const renameGroup = async (event: React.FormEvent, group: FamilyGroup) => {
    event.preventDefault();
    if (!idToken) return;
    setSavingEdit(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/family/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not rename this group.');
      setGroups((current) => current.map((item) => item.id === group.id ? { ...item, name: editName.trim(), description: editDescription.trim() || null } : item));
      setEditingGroupId(null);
      setNotice('Family group details updated.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not rename this group.');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeMember = async (group: FamilyGroup, member: FamilyGroupMember) => {
    if (!idToken || member.isOrganizer) return;
    const action = group.isOwner ? (member.status === 'pending' ? 'Cancel this invitation' : 'Remove this member') : 'Leave this group';
    const detail = group.isOwner
      ? (member.status === 'pending' ? `Cancel the invitation to ${member.name}?` : `Remove ${member.name} from “${group.name}”? They will lose access to the group discussion.`)
      : `Leave “${group.name}”? You will lose access to its posts and replies.`;
    if (!window.confirm(detail)) return;
    setChangingMemberUserId(member.userId);
    setLoadError(null);
    try {
      const response = await fetch(`/api/family/groups/${group.id}/members/${member.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${action} failed.`);
      setNotice(group.isOwner ? `${member.name} is no longer in this group.` : `You left “${group.name}”.`);
      if (!group.isOwner && member.isCurrentUser) setActiveGroupId(null);
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : `${action} failed.`);
    } finally {
      setChangingMemberUserId(null);
    }
  };

  const respondToInvitation = async (invitation: GroupInvitation, accept: boolean) => {
    if (!idToken) return;
    setRespondingId(invitation.id);
    setLoadError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/family/groups/invitations/${invitation.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ accept }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not respond to this group invitation.');
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      notifyInvitationNotificationsChanged();
      setNotice(accept ? `You joined “${invitation.groupName}”. You can now view and contribute to its discussion.` : `You declined “${invitation.groupName}”.`);
      if (accept) {
        await load();
        setActiveGroupId(invitation.groupId);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not respond to this group invitation.');
    } finally {
      setRespondingId(null);
    }
  };

  const inviteFamilyMember = async (group: FamilyGroup, personId: number) => {
    if (!idToken || !personId) return;
    setInvitingGroupId(group.id);
    setLoadError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/family/groups/${group.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ personId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not invite this family member.');
      setInviteSelections((current) => ({ ...current, [group.id]: '' }));
      setNotice('Invitation sent. They can access the group after they accept.');
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not invite this family member.');
    } finally {
      setInvitingGroupId(null);
    }
  };

  const submitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!idToken || !activeGroup) return;
    setSaving(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/family/groups/${activeGroup.id}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ body: postBody }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not publish your post.');
      setPostBody('');
      await loadPosts(activeGroup.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not publish your post.');
    } finally {
      setSaving(false);
    }
  };

  const submitComment = async (event: React.FormEvent, post: GroupPost) => {
    event.preventDefault();
    if (!idToken || !activeGroup) return;
    const body = commentDrafts[post.id]?.trim();
    if (!body) return;
    setReplyingTo(post.id);
    setLoadError(null);
    try {
      const response = await fetch(`/api/family/groups/${activeGroup.id}/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not add your reply.');
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
      await loadPosts(activeGroup.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not add your reply.');
    } finally {
      setReplyingTo(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Family</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#05224C] sm:text-3xl">Family groups</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Organise relatives into smaller circles such as siblings, cousins, or an extended family branch.</p>
        </div>
        <button type="button" onClick={() => { setShowForm(true); setFormError(null); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#05224C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#07306b]">
          <Plus className="h-4 w-4" aria-hidden="true" />Create a group
        </button>
      </header>

      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-950">
        Groups are invite-only spaces. Relatives can view posts and replies only after accepting an invitation; anyone who declines or has not responded cannot see the discussion.
      </p>

      {(notice || loadError) && <div role={loadError ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${loadError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{loadError || notice}</div>}

      {invitations.length > 0 && (
        <section aria-label="Group invitations" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900">Invitations to join a family group</h2>
          <div className="mt-3 space-y-2">
            {invitations.map((invitation) => (
              <article key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{invitation.groupName}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Invited by {invitation.inviterName} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  {invitation.groupDescription && <p className="mt-1 text-xs text-slate-500">{invitation.groupDescription}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">Accepting lets you see and post messages in this group.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={respondingId === invitation.id} onClick={() => void respondToInvitation(invitation, false)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Decline</button>
                  <button type="button" disabled={respondingId === invitation.id} onClick={() => void respondToInvitation(invitation, true)} className="rounded-lg bg-[#05224C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#07306b] disabled:opacity-50">{respondingId === invitation.id ? 'Saving…' : 'Accept'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}>
        <form onSubmit={createGroup} role="dialog" aria-modal="true" aria-labelledby="create-family-group-title" className="max-h-[94dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 id="create-family-group-title" className="text-lg font-bold text-[#05224C]">Create a family group</h2>
              <p className="mt-1 text-xs text-slate-500">Choose relatives with GeoSmart accounts. You’ll be included as organiser, and the others will receive invitations.</p>
            </div>
            <button type="button" aria-label="Close create group dialog" disabled={saving} onClick={() => setShowForm(false)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
          </header>
          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{formError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">Group name
              <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Williams siblings" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
            </label>
            <label className="text-xs font-semibold text-slate-700">Description (optional)
              <input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What brings this group together?" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
            </label>
          </div>
          {groupedByRelationship.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">There are no connected relatives with GeoSmart accounts to invite yet. Invite a family member to GeoSmart first, then create a group.</p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-slate-700">Choose group members <span className="font-normal text-slate-500">({selectedIds.length} selected)</span></legend>
              {groupedByRelationship.map(([label, people]) => (
                <div key={label}>
                  <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {people.map((person) => (
                      <label key={person.personId} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={selectedIds.includes(person.personId)} onChange={() => toggleMember(person.personId)} className="accent-[#05224C]" />
                        <span className="min-w-0 truncate">{person.firstName} {person.lastName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            <input type="checkbox" required checked={inviteConfirmed} onChange={(event) => setInviteConfirmed(event.target.checked)} className="mt-0.5 accent-[#05224C]" />
            <span>I want to send invitations to the selected GeoSmart account holders. They will not be able to see this group unless they accept.</span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={saving} onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || selectedIds.length === 0 || !inviteConfirmed} className="rounded-lg bg-[#05224C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#07306b] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Creating…' : 'Create group & invite'}</button>
          </div>
        </form>
        </div>
      )}

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Loading family groups…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <FolderHeart className="mx-auto h-9 w-9 text-sky-700" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-slate-900">No family groups yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Create a circle for siblings, cousins, or any branch you want to keep organised.</p>
          <button type="button" onClick={() => setShowForm(true)} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#05224C] hover:bg-slate-50">Create your first group</button>
        </div>
      ) : (
        <section aria-label="Your family groups" className="grid gap-5 sm:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-[#05224C]">{group.name}</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Created {new Date(group.createdAt).toLocaleDateString()}</p>
                </div>
                {group.isOwner && <button type="button" title="Rename group" aria-label={`Rename ${group.name}`} onClick={() => beginRename(group)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#05224C]"><Pencil className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
              {group.description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{group.description}</p>}
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Users className="h-3.5 w-3.5" aria-hidden="true" />{group.members.filter((member) => member.status === 'accepted').length} members · {group.members.filter((member) => member.status === 'pending').length} invited</div>
              {group.isOwner && (() => {
                const candidates = familyMembers.filter((person) =>
                  !group.members.some((member) => member.personId === person.personId));
                const inviteableCandidates = candidates.filter((person) => Boolean(person.userId));
                return (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <h3 className="text-sm font-bold text-[#05224C]">Add a member</h3>
                    {candidates.length > 0 ? <>
                      <label htmlFor={`invite-member-${group.id}`} className="mt-2 block text-xs text-slate-700">Choose someone from your family tree</label>
                      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                        <select id={`invite-member-${group.id}`} value={inviteSelections[group.id] || ''} onChange={(event) => setInviteSelections((current) => ({ ...current, [group.id]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value="">Select a relative</option>
                          {candidates.map((person) => <option key={person.personId} value={person.personId} disabled={!person.userId}>{person.firstName} {person.lastName}{person.userId ? '' : ' — needs a GeoSmart account'}</option>)}
                        </select>
                        <button type="button" disabled={!inviteSelections[group.id] || !inviteableCandidates.some((person) => person.personId === Number(inviteSelections[group.id])) || invitingGroupId === group.id} onClick={() => void inviteFamilyMember(group, Number(inviteSelections[group.id]))} className="min-h-10 shrink-0 rounded-lg bg-[#05224C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#07306b] disabled:cursor-not-allowed disabled:opacity-50">{invitingGroupId === group.id ? 'Sending invitation…' : 'Send invitation'}</button>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">Relatives marked “needs a GeoSmart account” are in your tree, but can’t sign in to the group yet. Account holders can see and take part after accepting the invitation.</p>
                    </> : <p className="mt-1 text-xs leading-relaxed text-slate-600">Everyone in your family tree is already a group member or has an invitation pending.</p>}
                  </div>
                );
              })()}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <h3 className="mb-1 text-sm font-bold text-[#05224C]">Members and invitations</h3>
                <p className="mb-3 text-xs text-slate-500">{group.isOwner ? 'Review member status and manage access below.' : 'See who is in this group and leave using the action beside your name.'}</p>
                <ul className="space-y-2">
                  {group.members.map((person) => (
                    <li key={person.userId} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{person.name}{person.isOrganizer ? ' · Organiser' : ''}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{person.isOrganizer ? 'Group creator' : getRelationshipLabel(person.relationshipType)} · {person.status === 'pending' ? `Invitation pending · sent ${new Date(person.joinedAt).toLocaleDateString()}` : person.isOrganizer ? 'Organiser' : `Joined ${new Date(person.joinedAt).toLocaleDateString()}`}</p>
                      </div>
                      {(group.isOwner && !person.isOrganizer || person.isCurrentUser && !group.isOwner) && (
                        <button type="button" disabled={changingMemberUserId === person.userId} onClick={() => void removeMember(group, person)} className="min-h-9 shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{changingMemberUserId === person.userId ? 'Updating…' : group.isOwner ? person.status === 'pending' ? 'Cancel invitation' : 'Remove member' : 'Leave group'}</button>
                      )}
                    </li>
                  ))}
                  {group.members.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">No members or invitations to show yet.</li>}
                </ul>
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setActiveGroupId(group.id)} className="rounded-lg bg-[#05224C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#07306b]">Open discussion</button>
                {group.isOwner && <button type="button" aria-label={`Delete ${group.name}`} title="Delete group" disabled={deletingId === group.id} onClick={() => void deleteGroup(group)} className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
            </article>
          ))}
        </section>
      )}

      {editingGroupId !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingEdit) setEditingGroupId(null); }}>
          <form onSubmit={(event) => {
            const group = groups.find((item) => item.id === editingGroupId);
            if (group) void renameGroup(event, group);
          }} role="dialog" aria-modal="true" aria-labelledby="rename-family-group-title" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 id="rename-family-group-title" className="text-lg font-bold text-[#05224C]">Edit family group</h2>
                <p className="mt-1 text-xs text-slate-500">Update the group name or description.</p>
              </div>
              <button type="button" aria-label="Close edit group dialog" disabled={savingEdit} onClick={() => setEditingGroupId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
            </header>
            {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{loadError}</p>}
            <label className="block text-xs font-semibold text-slate-700">Group name
              <input required autoFocus maxLength={100} value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">Description (optional)
              <textarea rows={3} maxLength={1000} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" disabled={savingEdit} onClick={() => setEditingGroupId(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={savingEdit || !editName.trim()} className="rounded-lg bg-[#05224C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#07306b] disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}

      {activeGroup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveGroupId(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="family-group-discussion-title" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[90dvh]">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Group discussion</p>
              <h2 id="family-group-discussion-title" className="mt-1 text-xl font-bold text-[#05224C]">{activeGroup.name}</h2>
              {activeGroup.description && <p className="mt-1 text-sm text-slate-600">{activeGroup.description}</p>}
            </div>
            <button type="button" aria-label="Close group discussion" onClick={() => setActiveGroupId(null)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" aria-hidden="true" /></button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <form onSubmit={submitPost} className="space-y-2 rounded-xl bg-slate-50 p-3">
            <label htmlFor="family-group-post" className="text-xs font-semibold text-slate-700">Start a conversation</label>
            <textarea id="family-group-post" required maxLength={5000} rows={3} value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="Share an update, memory, or question with this group…" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
            <div className="flex justify-end"><button type="submit" disabled={saving || !postBody.trim()} className="rounded-lg bg-[#05224C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#07306b] disabled:opacity-50">{saving ? 'Posting…' : 'Post to group'}</button></div>
          </form>
          {postsLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading discussion…</p>
          ) : posts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No posts yet. Start the first conversation.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <article key={post.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{post.authorName}</h3>
                    <time className="text-[11px] text-slate-500" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{post.body}</p>
                  {post.comments.length > 0 && (
                    <ol className="mt-3 space-y-2 border-l-2 border-slate-100 pl-3">
                      {post.comments.map((comment) => (
                        <li key={comment.id} className="text-xs">
                          <span className="font-semibold text-slate-800">{comment.authorName}</span>
                          <time className="ml-2 text-[10px] text-slate-400" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-600">{comment.body}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                  <form onSubmit={(event) => void submitComment(event, post)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor={`family-group-comment-${post.id}`}>Reply to {post.authorName}</label>
                    <input id={`family-group-comment-${post.id}`} maxLength={2000} value={commentDrafts[post.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a reply…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#05224C]" />
                    <button type="submit" disabled={replyingTo === post.id || !commentDrafts[post.id]?.trim()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#05224C] hover:bg-slate-50 disabled:opacity-50">{replyingTo === post.id ? 'Replying…' : 'Reply'}</button>
                  </form>
                </article>
              ))}
            </div>
          )}
          </div>
        </section>
        </div>
      )}
    </div>
  );
};
