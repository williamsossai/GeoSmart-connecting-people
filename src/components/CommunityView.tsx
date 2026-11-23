import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  Compass,
  Plus,
  Trash2,
  Lock,
  Share2,
  Globe,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Tag,
  Building2,
} from 'lucide-react';
import type { CommunityWithConnection } from '../types.ts';

export const CommunityView: React.FC = () => {
  const { idToken, refreshOverview } = useAuth();
  const [communities, setCommunities] = useState<CommunityWithConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // In-app Disconnect Confirmation Modal
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: number; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [communityType, setCommunityType] = useState('hometown');
  const [connectionType, setConnectionType] = useState('member');
  const [humanLabel, setHumanLabel] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCommunities = async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/communities', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommunities(data);
      }
    } catch (err) {
      console.error('Failed to load communities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunities();
  }, [idToken]);

  const handleAddCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          communityType,
          connectionType,
          humanLabel: humanLabel.trim() || undefined,
          description: description.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to connect community');
      }

      await fetchCommunities();
      await refreshOverview();
      setShowAddModal(false);
      setName('');
      setDescription('');
      setNotes('');
      setHumanLabel('');
      setSuccessMsg('Community connected successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error adding community:', err);
      setErrorMsg('Failed to add community connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const executeRemove = async (connectionId: number, communityName: string) => {
    if (!idToken) return;

    try {
      const res = await fetch(`/api/communities/${connectionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove community');
      }
      await fetchCommunities();
      await refreshOverview();
      setSuccessMsg(`Disconnected from "${communityName}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Error removing community:', err);
      setErrorMsg(err.message || 'Failed to remove community.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleRemove = (connectionId: number, communityName: string) => {
    setDisconnectTarget({ id: connectionId, name: communityName });
  };

  const formatType = (t: string) => {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#05224C] tracking-tight">
            My Community
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Where do I belong? Associations, diaspora groups, hometown unions, and cultural circles.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-medium transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Community</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Connected Communities</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distinct from geographic places, these represent the human associations and circles you belong to.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-[#05224C]">
            {communities.length} {communities.length === 1 ? 'Community' : 'Communities'}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading communities...</div>
        ) : communities.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-700">No communities connected yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add your hometown association, diaspora union, or local civic group to establish where you belong.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#05224C] text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect First Community</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {communities.map((c) => {
              const commName = c.name || (c as any).community?.name || 'Community';
              const commType = c.communityType || (c as any).community?.communityType || 'hometown';
              const commDesc = c.description || (c as any).community?.description;

              return (
                <div
                  key={c.connectionId}
                  className="p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition flex flex-col justify-between space-y-4 shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="p-2 rounded-lg bg-sky-50 text-[#05224C]">
                          <Compass className="w-4 h-4 text-sky-700" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {commName}
                          </h3>
                          <span className="text-[11px] font-medium text-slate-500">
                            {formatType(commType)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(c.connectionId, commName)}
                        title="Disconnect community"
                        className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {commDesc && (
                      <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                        {commDesc}
                      </p>
                    )}

                    {c.notes && (
                      <p className="text-xs text-slate-500 italic mt-2 border-l-2 border-slate-200 pl-2">
                        "{c.notes}"
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center space-x-1.5">
                      <Tag className="w-3 h-3 text-slate-400" />
                      <span className="capitalize font-medium text-[#05224C]">
                        {c.humanLabel || formatType(c.connectionType)}
                      </span>
                    </div>
                    <span className="text-slate-500">Private</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Community Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Connect a Community</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-300 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCommunity} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Community Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Asaba Development Association UK"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Community Type
                  </label>
                  <select
                    value={communityType}
                    onChange={(e) => setCommunityType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                  >
                    <option value="hometown">Hometown Community</option>
                    <option value="diaspora">Diaspora Community</option>
                    <option value="village">Village Community</option>
                    <option value="town">Town Community</option>
                    <option value="local">Local Community</option>
                    <option value="cultural_association">Cultural Association</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Your Connection
                  </label>
                  <select
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                  >
                    <option value="member">Member</option>
                    <option value="resident">Resident</option>
                    <option value="origin">Origin</option>
                    <option value="ancestral">Ancestral</option>
                    <option value="family">Family</option>
                    <option value="marriage">Marriage</option>
                    <option value="professional">Professional</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Custom Label (Optional)
                </label>
                <input
                  type="text"
                  value={humanLabel}
                  onChange={(e) => setHumanLabel(e.target.value)}
                  placeholder="e.g. London Chapter Secretary or Active Member"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Description / Purpose (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the community..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>

              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Community connections are private to your account. Sharing them with others is not available yet.
              </p>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-medium transition disabled:opacity-60"
                >
                  {submitting ? 'Connecting...' : 'Connect Community'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal for Disconnecting Community */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-slate-900 text-base">Disconnect Community?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to disconnect from <span className="font-semibold text-slate-800">{disconnectTarget.name}</span>?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={disconnecting}
                onClick={() => setDisconnectTarget(null)}
                className="flex-1 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disconnecting}
                onClick={async () => {
                  setDisconnecting(true);
                  try {
                    await executeRemove(disconnectTarget.id, disconnectTarget.name);
                    setDisconnectTarget(null);
                  } finally {
                    setDisconnecting(false);
                  }
                }}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
