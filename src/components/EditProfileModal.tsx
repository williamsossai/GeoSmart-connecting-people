import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import { X, User, Check, AlertCircle, Lock, Share2, Globe } from 'lucide-react';
import { ProfileLocationSelector } from './ProfileLocationSelector.tsx';
import type { VisibilitySetting } from '../types.ts';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { userOverview, idToken, refreshOverview } = useAuth();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [bio, setBio] = useState('');
  const [residenceSummary, setResidenceSummary] = useState('');
  const [originSummary, setOriginSummary] = useState('');
  const [visibility, setVisibility] = useState<VisibilitySetting>('private');

  useEffect(() => {
    if (isOpen && userOverview) {
      setFirstName(userOverview.person?.firstName || '');
      setLastName(userOverview.person?.lastName || '');
      setOtherNames(userOverview.person?.otherNames || '');
      setBio(userOverview.profile?.bio || '');
      setResidenceSummary(userOverview.profile?.currentResidenceSummary || '');
      setOriginSummary(userOverview.profile?.originSummary || '');
      setVisibility(userOverview.profile?.visibility || 'private');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, userOverview]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          otherNames: otherNames.trim(),
          bio: bio.trim(),
          currentResidenceSummary: residenceSummary.trim(),
          originSummary: originSummary.trim(),
          visibility,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update profile');
      }

      await refreshOverview();
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setErrorMsg(err.message || 'Something went wrong saving your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sky-300">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">Edit Profile</h3>
              <p className="text-xs text-sky-200">Update your personal details & privacy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Other Names / Middle Name
            </label>
            <input
              type="text"
              value={otherNames}
              onChange={(e) => setOtherNames(e.target.value)}
              placeholder="e.g. Chukwuemeka"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Bio & Personal Story
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your personal narrative or background..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ProfileLocationSelector
              label="Current Residence"
              value={residenceSummary}
              onChange={setResidenceSummary}
            />
            <ProfileLocationSelector
              label="Personal Origin"
              value={originSummary}
              onChange={setOriginSummary}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Privacy & Visibility
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col items-start ${
                  visibility === 'private'
                    ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] font-semibold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-0.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs">Private</span>
                </div>
                <span className="text-[10px] text-slate-400">Only you</span>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('shared')}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col items-start ${
                  visibility === 'shared'
                    ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] font-semibold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-0.5">
                  <Share2 className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-xs">Shared</span>
                </div>
                <span className="text-[10px] text-slate-400">Verified family</span>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col items-start ${
                  visibility === 'public'
                    ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] font-semibold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-0.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs">Public</span>
                </div>
                <span className="text-[10px] text-slate-400">Discovery pool</span>
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-semibold transition shadow-xs disabled:opacity-60"
            >
              {saving ? 'Saving changes...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
