import React, { useState } from 'react';
import {
  X,
  User,
  MapPin,
  Mail,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import type { FamilyTreeNode, RelationshipType } from '../types.ts';
import { familyGenderOptions, getRelationshipLabel, getRelationshipOptions } from '../lib/family-relationships.ts';
import { useAuth } from './AuthContext.tsx';
import { createFamilyInvitationFs, updateFamilyRelationshipFs } from '../lib/firestore-repo.ts';

interface FamilyMemberDetailModalProps {
  node: FamilyTreeNode | null;
  onClose: () => void;
  idToken: string | null;
  onUpdated: () => void;
  onRemove: (relationshipId: number, name: string) => void;
}

export const FamilyMemberDetailModal: React.FC<FamilyMemberDetailModalProps> = ({
  node,
  onClose,
  onUpdated,
  onRemove,
}) => {
  const { currentUser } = useAuth();
  if (!node) return null;

  const isSelf = Boolean(node.isSelf);
  const fullName = `${node.firstName} ${node.lastName}`.trim();

  // Invite states
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit relationship states
  const [isEditing, setIsEditing] = useState(false);
  const [editRelType, setEditRelType] = useState<RelationshipType>(
    (node.relationshipType as RelationshipType) || 'relative'
  );
  const canEditGender = !node.userId;
  const canEditNotes = !node.isLiving || (Boolean(node.userId) && node.visibility !== 'private');
  const [editGender, setEditGender] = useState(node.gender || 'unspecified');
  const [editNotes, setEditNotes] = useState(node.notes || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Disconnect states
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // Generate an invitation code for this family member
  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) return;
    setInviting(true);
    setInviteError(null);

    try {
      const data = await createFamilyInvitationFs(currentUser.uid, {
        personId: node.personId,
        inviteeEmail: inviteeEmail.trim(),
        relationshipType: node.relationshipType,
      });
      setCreatedInviteCode(data.inviteCode);
      onUpdated();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to create invitation');
    } finally {
      setInviting(false);
    }
  };

  // Save relationship updates
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = node.relationshipId || node.personId;
    if (!currentUser?.uid || !targetId) return;
    setSavingEdit(true);
    setEditError(null);

    try {
      await updateFamilyRelationshipFs(currentUser.uid, targetId, {
        relationshipType: editRelType,
        ...(canEditGender ? { gender: editGender } : {}),
        ...(canEditNotes ? { notes: editNotes.trim() || null } : {}),
      });
      setIsEditing(false);
      onUpdated();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update relationship');
    } finally {
      setSavingEdit(false);
    }
  };

  const copyCode = () => {
    if (createdInviteCode) {
      navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#05224C] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/10 text-sky-200 flex items-center justify-center font-bold text-sm">
              {node.firstName?.charAt(0)}
              {node.lastName?.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{fullName}</h3>
              <p className="text-xs text-sky-200 capitalize">
                {isSelf ? 'Your Profile (Anchor)' : `${getRelationshipLabel(node.relationshipType, node.gender)} · ${node.generationLabel}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-700">
          {/* Identity & Account Status */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Account Status
              </span>
              {node.hasAccount ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified GeoSmart Account</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  Unclaimed Profile (Created by Family)
                </span>
              )}
            </div>

            {node.hasAccount ? (
              <p className="text-xs text-slate-600">
                {isSelf
                  ? `Logged in as ${node.userEmail || 'Active user'}`
                  : `${fullName} has linked their account (${node.userEmail || 'GeoSmart user'}). They share this family branch.`}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                This record exists in your family tree. You can invite them or link their existing GeoSmart account to share connections.
              </p>
            )}
          </div>

          {/* Place & Geographic Context */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Geographic Roots & Origin
            </span>
            <div className="flex items-center space-x-2 text-slate-800 bg-white p-3 rounded-lg border border-slate-200">
              <MapPin className="w-4 h-4 text-sky-600 flex-shrink-0" />
              <span>{node.placeOfOrigin || 'No specific origin place recorded yet.'}</span>
            </div>
          </div>

          {/* Notes */}
          {node.notes && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Relationship Notes
              </span>
              <p className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-600">
                {node.notes}
              </p>
            </div>
          )}

          {/* Unclaimed Actions: invitation requires the recipient's consent */}
          {!isSelf && !node.hasAccount && (
            <div className="border-t border-slate-200 pt-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#05224C] flex items-center space-x-1.5">
                <Share2 className="w-3.5 h-3.5" />
                <span>Invite {node.firstName}</span>
              </h4>

              {/* Option A: Generate Invitation Code */}
              <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 space-y-3">
                <h5 className="text-xs font-bold text-sky-950">Option 1: Generate Family Invitation</h5>
                <p className="text-xs text-sky-900">
                  Send a private invitation to {node.firstName}. They must sign in with this verified email and accept the code before their account is linked.
                </p>

                {createdInviteCode ? (
                  <div className="p-3 bg-white rounded-lg border border-sky-300 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                      Private invitation code — copy it now
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg font-bold text-[#05224C] tracking-widest">
                        {createdInviteCode}
                      </span>
                      <button
                        onClick={copyCode}
                        className="px-3 py-1.5 bg-[#05224C] text-white rounded-md text-xs font-medium flex items-center space-x-1.5 hover:bg-[#083068] transition"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">Valid for 30 days and usable once by this verified email. The code is stored as a hash and shown only now.</p>
                  </div>
                ) : (
                  <form onSubmit={handleCreateInvite} className="space-y-2.5">
                    <input
                      type="email"
                      value={inviteeEmail}
                      onChange={(e) => setInviteeEmail(e.target.value)}
                      required
                      maxLength={254}
                      placeholder="Enter their verified email"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] bg-white"
                    />
                    {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
                    <button
                      type="submit"
                      disabled={inviting}
                      className="w-full py-2 bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-medium rounded-lg transition disabled:opacity-60"
                    >
                      {inviting ? 'Generating...' : 'Generate private invitation code'}
                    </button>
                  </form>
                )}
              </div>

            </div>
          )}

          {/* Edit Relationship Section */}
          {!isSelf && (node.relationshipId || node.personId) && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              {confirmDisconnect ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
                  <div className="flex items-center space-x-2 text-red-800">
                    <Trash2 className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <h5 className="text-xs font-bold">Disconnect {fullName}?</h5>
                  </div>
                  <p className="text-xs text-red-700">
                    Are you sure you want to disconnect {fullName} from your family tree? This will remove their node and relationship link.
                  </p>
                  {disconnectError && (
                    <p className="text-xs text-red-600 font-medium">{disconnectError}</p>
                  )}
                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      disabled={disconnecting}
                      onClick={() => {
                        setConfirmDisconnect(false);
                        setDisconnectError(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={disconnecting}
                      onClick={async () => {
                        setDisconnecting(true);
                        setDisconnectError(null);
                        try {
                          await onRemove(node.relationshipId || node.personId, fullName);
                          onClose();
                        } catch (err: any) {
                          setDisconnectError(err.message || 'Failed to disconnect');
                          setDisconnecting(false);
                        }
                      }}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition disabled:opacity-50 flex items-center space-x-1"
                    >
                      {disconnecting ? <span>Disconnecting...</span> : <span>Confirm Disconnect</span>}
                    </button>
                  </div>
                </div>
              ) : isEditing ? (
                <form onSubmit={handleSaveEdit} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h5 className="text-xs font-bold uppercase text-slate-800">Edit Relationship</h5>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      disabled={!canEditGender}
                      className="w-full rounded-lg border bg-white px-3 py-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      {familyGenderOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {!canEditGender && <p className="mt-1 text-[11px] text-slate-500">Only this account holder can change their gender.</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                    <select
                      value={editRelType}
                      onChange={(e) => setEditRelType(e.target.value as RelationshipType)}
                      className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white"
                    >
                      {getRelationshipOptions(editGender).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {canEditNotes && <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white"
                    />
                  </div>}

                  {editError && (
                    <p className="text-xs text-red-600">{editError}</p>
                  )}

                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setEditError(null);
                      }}
                      className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="px-3.5 py-1 bg-[#05224C] text-white text-xs font-medium rounded-lg"
                    >
                      {savingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-sky-700 font-semibold hover:underline"
                  >
                    {canEditNotes ? 'Edit relationship type or notes' : 'Edit relationship details'}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    className="text-red-600 hover:text-red-700 font-medium flex items-center space-x-1 px-2 py-1 hover:bg-red-50 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
