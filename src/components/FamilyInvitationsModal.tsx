import React, { useState, useEffect } from 'react';
import { X, Mail, Copy, Check, Clock, CheckCircle2, AlertCircle, RefreshCw, KeyRound, ArrowRight } from 'lucide-react';
import type { FamilyInvitationRecord, KinshipDiscoveryMatch } from '../types.ts';
import { getRelationshipLabel } from '../lib/family-relationships.ts';

interface FamilyInvitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  idToken: string | null;
  onSuccess?: () => void;
  onOpened?: () => void;
  embedded?: boolean;
}

export const FamilyInvitationsModal: React.FC<FamilyInvitationsModalProps> = ({
  isOpen,
  onClose,
  idToken,
  onSuccess,
  onOpened,
  embedded = false,
}) => {
  const [invitations, setInvitations] = useState<FamilyInvitationRecord[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<KinshipDiscoveryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Enter Invitation Code states
  const [manualCode, setManualCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [claimingInvitationId, setClaimingInvitationId] = useState<number | null>(null);

  const fetchInvitations = async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/family/invitations', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
      const discoveryRes = await fetch('/api/family/discovery', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (discoveryRes.ok) {
        setReceivedInvitations(await discoveryRes.json());
        setDiscoveryError(null);
      } else if (discoveryRes.status === 403) {
        setReceivedInvitations([]);
        setDiscoveryError('Verify your email address to view invitations sent to you.');
      } else {
        setReceivedInvitations([]);
        setDiscoveryError('Could not load invitations sent to you.');
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvitations();
      onOpened?.();
      setManualCode('');
      setRedeemSuccess(null);
      setRedeemError(null);
    }
  }, [isOpen, idToken, onOpened]);

  if (!isOpen) return null;

  const copyCode = (id: number, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleClaimInvitation = async (invitationId: number) => {
    if (!idToken) return;
    setClaimingInvitationId(invitationId);
    setRedeemError(null);
    try {
      const response = await fetch('/api/family/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ invitationId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to accept invitation.');
      }
      setReceivedInvitations((current) => current.filter((invitation) => invitation.invitationId !== invitationId));
      await fetchInvitations();
      await onSuccess?.();
    } catch (error: any) {
      setRedeemError(error.message || 'Failed to accept invitation.');
    } finally {
      setClaimingInvitationId(null);
    }
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken || !manualCode.trim()) return;
    setRedeeming(true);
    setRedeemError(null);
    setRedeemSuccess(null);

    try {
      const res = await fetch('/api/family/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteCode: manualCode.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Invalid or expired invitation code');
      }

      setRedeemSuccess('Invitation accepted! Your family tree connection has been linked.');
      setManualCode('');
      await fetchInvitations();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setRedeemError(err.message || 'Failed to redeem invitation code.');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className={embedded ? 'w-full' : 'fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4'}>
      <div className={embedded
        ? 'mx-auto w-full max-w-6xl space-y-6'
        : 'max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col'}>
        {/* Header */}
        <div className={embedded
          ? 'flex items-start justify-between gap-4 border-b border-slate-200 pb-4'
          : 'flex items-center justify-between bg-[#05224C] px-6 py-4 text-white'}>
          <div className="flex items-center space-x-2.5">
            {!embedded && <Mail className="w-5 h-5 text-sky-300" />}
            <div>
              <h1 className={embedded ? 'text-2xl font-bold tracking-tight text-[#05224C] sm:text-3xl' : 'text-base font-bold'}>
                {embedded ? 'Invitations' : 'Family Invitations'}
              </h1>
              <p className={embedded ? 'mt-1 text-sm text-slate-500' : 'text-xs text-sky-200'}>
                {embedded
                  ? 'Review invitations sent to you and invitations you have sent.'
                  : 'Enter a private invitation code or review invitations you shared with relatives.'}
              </p>
            </div>
          </div>
          {!embedded && (
            <button
              onClick={onClose}
              aria-label="Close invitations"
              className="rounded-md p-1 text-slate-300 transition hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className={embedded ? 'space-y-6' : 'flex-1 space-y-6 overflow-y-auto p-6'}>
          {/* Invitations addressed to the signed-in user */}
          <div className="space-y-3">
            <div className="border-b border-slate-200 pb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Invitations sent to you</h4>
              <p className="mt-1 text-xs text-slate-500">Accept a verified-email invitation to connect the family record to your account.</p>
            </div>
            {discoveryError ? (
              <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{discoveryError}</p>
            ) : receivedInvitations.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No pending invitations have been sent to your account.</p>
            ) : receivedInvitations.map((invitation) => (
              <div key={invitation.invitationId} className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{invitation.personName}</p>
                  <p className="mt-1 text-xs text-slate-600">Invited by {invitation.discoveredByName} · {getRelationshipLabel(invitation.suggestedRelationship, invitation.suggestedGender)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClaimInvitation(invitation.invitationId)}
                  disabled={claimingInvitationId !== null}
                  className="min-h-10 rounded-lg bg-[#05224C] px-4 text-xs font-semibold text-white hover:bg-[#07306b] disabled:opacity-60"
                >
                  {claimingInvitationId === invitation.invitationId ? 'Connecting…' : 'Accept & connect'}
                </button>
              </div>
            ))}
            {redeemError && <p role="alert" className="text-xs text-red-600">{redeemError}</p>}
          </div>

          {/* Section 1: Received an invitation code? Enter Code */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 via-slate-50 to-indigo-50/40 border border-sky-200 space-y-3 shadow-2xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#05224C] text-white flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#05224C]">
                  Received an invitation code from a family member?
                </h4>
                <p className="text-[11px] text-slate-500">
                  Enter the private invitation code using the verified email it was sent to.
                </p>
              </div>
            </div>

            <form onSubmit={handleRedeemCode} className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                required
                  maxLength={64}
                value={manualCode}
                  onChange={(e) => {
                  setManualCode(e.target.value.trim());
                  setRedeemError(null);
                }}
                placeholder="Enter the private invitation code"
                className="flex-1 px-3.5 py-2 text-sm font-mono font-bold tracking-wider uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
              />
              <button
                type="submit"
                disabled={redeeming || !manualCode.trim()}
                className="px-4 py-2 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition disabled:opacity-50 whitespace-nowrap shadow-xs"
              >
                {redeeming ? (
                  <span>Connecting...</span>
                ) : (
                  <>
                    <span>Enter Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            {redeemError && (
              <div className="text-xs text-red-600 flex items-center space-x-1.5 pt-0.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{redeemError}</span>
              </div>
            )}

            {redeemSuccess && (
              <div className="text-xs text-emerald-700 font-semibold flex items-center space-x-1.5 pt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{redeemSuccess}</span>
              </div>
            )}
          </div>

          {/* Section 2: Invitations You Sent */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Invitations You Sent ({invitations.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Track invitation codes you generated for relatives to connect to your tree.
                </p>
              </div>
              <button
                onClick={fetchInvitations}
                title="Refresh invitations"
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading invitation records...</div>
            ) : invitations.length === 0 ? (
              <div className="py-8 text-center space-y-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Mail className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No invitations generated yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Click on any relative in your family tree who doesn't have an account yet, and select "Generate Family Invitation".
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-slate-900">{inv.personName}</h4>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                          {getRelationshipLabel(inv.relationshipType, inv.gender)}
                        </span>
                      </div>

                      {inv.inviteeEmail && (
                        <p className="text-xs text-slate-500">Sent to: {inv.inviteeEmail}</p>
                      )}

                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 pt-0.5">
                        <span>Created: {new Date(inv.createdAt).toLocaleDateString()}</span>
                        <span>·</span>
                        <span>Expires: {new Date(inv.expiresAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Code & Status */}
                    <div className="flex items-center space-x-3 sm:self-center">
                      <div className="text-right">
                        <div className="font-mono text-base font-extrabold text-[#05224C] tracking-wider bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                          {inv.inviteCode || 'Code shown once when created'}
                        </div>
                        <div className="text-[10px] mt-1 flex items-center justify-end space-x-1">
                          {inv.status === 'accepted' ? (
                            <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Claimed</span>
                            </span>
                          ) : inv.status === 'revoked' ? (
                            <span className="text-slate-600 font-medium">Revoked</span>
                          ) : inv.status === 'expired' || new Date(inv.expiresAt).getTime() <= Date.now() ? (
                            <span className="text-red-600 font-medium">Expired</span>
                          ) : (
                            <span className="text-amber-700 font-medium flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>Pending</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {inv.inviteCode && <button
                        onClick={() => copyCode(inv.id, inv.inviteCode || '')}
                        title="Copy invitation code"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#05224C] transition"
                      >
                        {copiedId === inv.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!embedded && (
          <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
