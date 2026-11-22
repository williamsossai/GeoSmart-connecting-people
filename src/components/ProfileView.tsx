import React from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  MapPin,
  Compass,
  Users,
  Lock,
  Globe,
  Share2,
  Settings,
} from 'lucide-react';

interface ProfileViewProps {
  onNavigate: (tab: 'family' | 'community' | 'place') => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigate }) => {
  const { userOverview } = useAuth();

  const visibility = userOverview?.profile?.visibility || 'private';
  const firstName = userOverview?.person?.firstName || 'User';
  const lastName = userOverview?.person?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const otherNames = userOverview?.person?.otherNames;
  const email = userOverview?.user?.email || '';
  const bio = userOverview?.profile?.bio;
  const residenceSummary = userOverview?.profile?.currentResidenceSummary;
  const originSummary = userOverview?.profile?.originSummary;

  const initials = firstName && lastName
    ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
    : firstName.charAt(0).toUpperCase();

  const stats = userOverview?.stats || {
    countriesCount: 0,
    placesCount: 0,
    communitiesCount: 0,
    familyCount: 0,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#05224C] tracking-tight">
          My Profile
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Who am I? Your personal identity, biography, and lineage foundation.
        </p>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Identity badge row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-full bg-[#05224C] text-white flex items-center justify-center text-xl font-bold tracking-wider shadow-sm">
                {initials}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {fullName}
                  {otherNames && (
                    <span className="text-slate-500 font-normal ml-1.5 text-base">
                      ({otherNames})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{email}</p>
              </div>
            </div>

            {/* Privacy badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border capitalize bg-slate-50 text-slate-700 border-slate-200">
              {visibility === 'private' ? (
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              ) : visibility === 'shared' ? (
                <Share2 className="w-3.5 h-3.5 text-sky-600" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{visibility} Record</span>
            </div>
          </div>

          {/* Bio */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Bio & Personal Story
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {bio ? (
                bio
              ) : (
                <span className="text-slate-400 italic">
                  No biography provided yet.
                </span>
              )}
            </p>
          </div>

          {/* Summaries Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#05224C] mb-1">
                <MapPin className="w-4 h-4 text-sky-700" />
                <span>Current Residence</span>
              </div>
              <p className="text-sm text-slate-700">
                {residenceSummary || <span className="text-slate-400 italic">Not specified</span>}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#05224C] mb-1">
                <Globe className="w-4 h-4 text-sky-700" />
                <span>Personal Origin</span>
              </div>
              <p className="text-sm text-slate-700">
                {originSummary || <span className="text-slate-400 italic">Not specified</span>}
              </p>
            </div>
          </div>

          {/* Summary Connections Links */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Connected Foundation Summary
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <button
                onClick={() => onNavigate('family')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition group"
              >
                <Users className="w-4 h-4 mx-auto text-slate-600 group-hover:text-[#05224C] mb-1" />
                <div className="text-lg font-bold text-[#05224C]">{stats.familyCount}</div>
                <div className="text-[11px] font-medium text-slate-500">Family Members</div>
              </button>
              <button
                onClick={() => onNavigate('community')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition group"
              >
                <Compass className="w-4 h-4 mx-auto text-slate-600 group-hover:text-[#05224C] mb-1" />
                <div className="text-lg font-bold text-[#05224C]">{stats.communitiesCount}</div>
                <div className="text-[11px] font-medium text-slate-500">Communities</div>
              </button>
              <button
                onClick={() => onNavigate('place')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition group"
              >
                <MapPin className="w-4 h-4 mx-auto text-slate-600 group-hover:text-[#05224C] mb-1" />
                <div className="text-lg font-bold text-[#05224C]">{stats.placesCount}</div>
                <div className="text-[11px] font-medium text-slate-500">Connected Places</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile quick-tip note */}
      <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-100 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2.5">
          <Settings className="w-4 h-4 text-sky-700 flex-shrink-0" />
          <span>
            Looking for account controls? <strong>Edit Profile</strong>, <strong>Settings</strong>, <strong>Export My Data</strong>, and <strong>Delete My Data</strong> are available in your <strong>Profile button</strong> at the top right.
          </span>
        </div>
      </div>
    </div>
  );
};
