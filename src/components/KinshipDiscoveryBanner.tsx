import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import type { KinshipDiscoveryMatch } from '../types.ts';

interface KinshipDiscoveryBannerProps {
  idToken: string | null;
  onClaimed: () => void;
}

export const KinshipDiscoveryBanner: React.FC<KinshipDiscoveryBannerProps> = ({
  idToken,
  onClaimed,
}) => {
  const [matches, setMatches] = useState<KinshipDiscoveryMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const fetchDiscovery = async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/family/discovery', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMatches(data);
      }
    } catch (err) {
      console.error('Error fetching discovery matches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscovery();
  }, [idToken]);

  const handleClaim = async (invitationId: number, relativeName: string) => {
    if (!idToken) return;
    setClaimingId(invitationId);
    setErrorNotice(null);

    try {
      const res = await fetch('/api/family/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ invitationId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to connect family network');
      }

      setSuccessNotice(`Successfully connected! You have joined ${relativeName}'s family tree.`);
      await fetchDiscovery();
      onClaimed();
      setTimeout(() => setSuccessNotice(null), 5000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to claim connection.');
    } finally {
      setClaimingId(null);
    }
  };

  if (matches.length === 0 && !successNotice && !errorNotice) {
    return null;
  }

  return (
    <div className="space-y-3">
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-emerald-700 hover:text-emerald-900">
            ✕
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button onClick={() => setErrorNotice(null)} className="text-red-700 hover:text-red-900">
            ✕
          </button>
        </div>
      )}

      {matches.map((match) => (
        <div
          key={match.invitationId}
          className="p-4 rounded-2xl bg-gradient-to-r from-sky-50 via-indigo-50 to-white border border-sky-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#05224C] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#05224C]">
                  Kinship Discovery
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                  {match.totalFamilyInNetwork} Relatives in Network
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                Connect with {match.discoveredByName}'s Family Tree
              </h4>
              <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                {match.matchReason}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:self-center">
            <button
              onClick={() => handleClaim(match.invitationId, match.discoveredByName)}
              disabled={claimingId === match.invitationId}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-xs disabled:opacity-60 whitespace-nowrap"
            >
              <span>{claimingId === match.invitationId ? 'Connecting...' : 'Accept invitation & connect'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
