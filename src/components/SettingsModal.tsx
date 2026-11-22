import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import { useInvitationNotifications } from './InvitationNotificationsContext.tsx';
import {
  X,
  Settings,
  Shield,
  Lock,
  Globe,
  Share2,
  Download,
  Trash2,
  Check,
  AlertCircle,
  Database,
  Bell,
  User,
} from 'lucide-react';
import type { CommunityWithConnection, PlaceWithConnection, VisibilitySetting } from '../types.ts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenEditProfile: () => void;
  onOpenDeleteAccount: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenEditProfile,
  onOpenDeleteAccount,
}) => {
  const { userOverview, idToken, refreshOverview } = useAuth();
  const { alertsEnabled, updateInvitationAlerts } = useInvitationNotifications();
  const [activeSection, setActiveSection] = useState<'privacy' | 'account' | 'preferences' | 'data'>('privacy');
  const [visibility, setVisibility] = useState<VisibilitySetting>(
    userOverview?.profile?.visibility || 'private'
  );
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacySuccess, setPrivacySuccess] = useState<string | null>(null);
  const [privacyRecordsLoading, setPrivacyRecordsLoading] = useState(false);
  const [privacyRecordsError, setPrivacyRecordsError] = useState<string | null>(null);
  const [placeConnections, setPlaceConnections] = useState<PlaceWithConnection[]>([]);
  const [communityConnections, setCommunityConnections] = useState<CommunityWithConnection[]>([]);
  const [savingPlaceConnectionId, setSavingPlaceConnectionId] = useState<number | null>(null);

  // Preference toggles (saved locally / session)
  const [discoveryNotifications, setDiscoveryNotifications] = useState(true);
  const [savingMatchAlerts, setSavingMatchAlerts] = useState(false);
  const [matchAlertsError, setMatchAlertsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setVisibility(userOverview?.profile?.visibility || 'private');
  }, [isOpen, userOverview?.profile?.visibility]);

  useEffect(() => {
    if (!isOpen || !idToken) return;
    let cancelled = false;
    setPrivacyRecordsLoading(true);
    setPrivacyRecordsError(null);
    Promise.all([
      fetch('/api/places', { headers: { Authorization: `Bearer ${idToken}` } }),
      fetch('/api/communities', { headers: { Authorization: `Bearer ${idToken}` } }),
    ])
      .then(async ([placesResponse, communitiesResponse]) => {
        if (!placesResponse.ok || !communitiesResponse.ok) throw new Error('Could not load all privacy records.');
        const [places, communities] = await Promise.all([
          placesResponse.json() as Promise<PlaceWithConnection[]>,
          communitiesResponse.json() as Promise<CommunityWithConnection[]>,
        ]);
        if (!cancelled) {
          setPlaceConnections(places);
          setCommunityConnections(communities);
        }
      })
      .catch((error) => {
        console.error('Failed to load privacy records:', error);
        if (!cancelled) setPrivacyRecordsError('Could not load place and community privacy settings.');
      })
      .finally(() => { if (!cancelled) setPrivacyRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, idToken]);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpdatePrivacy = async () => {
    if (!idToken) return;
    setSavingPrivacy(true);
    setPrivacySuccess(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) throw new Error('Failed to update privacy');
      await refreshOverview();
      setPrivacySuccess('Default privacy setting saved.');
      setTimeout(() => setPrivacySuccess(null), 3000);
    } catch (err) {
      console.error('Error updating privacy:', err);
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handlePlaceVisibilityChange = async (place: PlaceWithConnection, nextVisibility: VisibilitySetting) => {
    if (!idToken || nextVisibility === place.visibility) return;
    setSavingPlaceConnectionId(place.connectionId);
    setPrivacyRecordsError(null);
    try {
      const res = await fetch(`/api/places/${place.connectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: place.name,
          country: place.country,
          stateRegion: place.stateRegion,
          districtLga: place.districtLga,
          townCity: place.townCity,
          villageLocality: place.villageLocality,
          placeType: place.placeType,
          connectionType: place.connectionType,
          humanLabel: place.humanLabel,
          isCurrent: place.isCurrent,
          notes: place.notes,
          visibility: nextVisibility,
        }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || 'Could not update this place sharing setting.');
      }
      setPlaceConnections((current) => current.map((item) => (
        item.connectionId === place.connectionId ? { ...item, visibility: nextVisibility } : item
      )));
      await refreshOverview();
      setPrivacySuccess('Place sharing setting saved.');
      setTimeout(() => setPrivacySuccess(null), 3000);
    } catch (error: any) {
      console.error('Failed to update place sharing:', error);
      setPrivacyRecordsError(error.message || 'Could not update this place sharing setting.');
    } finally {
      setSavingPlaceConnectionId(null);
    }
  };

  const handleToggleMatchAlerts = async () => {
    setSavingMatchAlerts(true);
    setMatchAlertsError(null);
    try {
      await updateInvitationAlerts(!alertsEnabled);
    } catch (error) {
      console.error('Error updating invitation alerts:', error);
      setMatchAlertsError('Could not save this preference. Please try again.');
    } finally {
      setSavingMatchAlerts(false);
    }
  };

  const handleExportData = async () => {
    if (!idToken) return;
    setExporting(true);
    setExportSuccess(null);
    try {
      const res = await fetch('/api/user/export', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `geosmart-archive-${userOverview?.user.id || 'export'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportSuccess('Archive downloaded successfully.');
      setTimeout(() => setExportSuccess(null), 3500);
    } catch (err) {
      console.error('Error exporting data:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sky-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">Account Settings</h3>
              <p className="text-xs text-sky-200">Privacy, notifications & data governance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 pt-3 space-x-1 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveSection('privacy')}
            className={`pb-3 px-3 border-b-2 transition ${
              activeSection === 'privacy'
                ? 'border-[#05224C] text-[#05224C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Privacy & Sharing
          </button>
          <button
            onClick={() => setActiveSection('account')}
            className={`pb-3 px-3 border-b-2 transition ${
              activeSection === 'account'
                ? 'border-[#05224C] text-[#05224C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Account Details
          </button>
          <button
            onClick={() => setActiveSection('preferences')}
            className={`pb-3 px-3 border-b-2 transition ${
              activeSection === 'preferences'
                ? 'border-[#05224C] text-[#05224C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Preferences
          </button>
          <button
            onClick={() => setActiveSection('data')}
            className={`pb-3 px-3 border-b-2 transition ${
              activeSection === 'data'
                ? 'border-[#05224C] text-[#05224C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Data Sovereignty
          </button>
        </div>

        {/* Section Contents */}
        <div className="p-6 space-y-6">
          {/* 1. Privacy & Sharing */}
          {activeSection === 'privacy' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Record Visibility Default</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Private hides profile details from other accounts. Shared and Public currently have the same effect: connected family accounts can see them. Neither makes your profile web searchable. Place records have separate visibility settings.
                </p>
              </div>

              {privacySuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{privacySuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    visibility === 'private'
                      ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] ring-1 ring-[#05224C]'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold">Private</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Your profile details are not shown to other connected accounts.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('shared')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    visibility === 'shared'
                      ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] ring-1 ring-[#05224C]'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Share2 className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold">Shared</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Profile details may be shown to people connected through family records.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    visibility === 'public'
                      ? 'border-[#05224C] bg-sky-50/50 text-[#05224C] ring-1 ring-[#05224C]'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold">Public</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Profile details may be shown through family connections. This setting does not make your profile publicly searchable on the web.
                  </p>
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={savingPrivacy || visibility === userOverview?.profile?.visibility}
                  onClick={handleUpdatePrivacy}
                  className="px-4 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-semibold transition disabled:opacity-50 shadow-xs"
                >
                  {savingPrivacy ? 'Saving...' : 'Save Privacy Setting'}
                </button>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h5 className="text-xs font-bold text-slate-800">Recent sharing choices</h5>
                <p className="mt-0.5 text-[11px] text-slate-500">The five most recent profile or place sharing changes.</p>
                {userOverview?.privacyHistory?.length ? (
                  <ul className="mt-2 space-y-2">
                    {userOverview.privacyHistory.map((entry) => {
                      const label = (value: VisibilitySetting) => value === 'private' ? 'Private' : value === 'shared' ? 'Shared' : 'Public';
                      return (
                        <li key={entry.id} className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="text-slate-700">{entry.scope}: {label(entry.previous)} → {label(entry.selected)}</span>
                          <time className="shrink-0 text-slate-500" dateTime={entry.createdAt}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </time>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">No profile sharing changes recorded yet.</p>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h5 className="text-xs font-bold text-slate-800">Place sharing</h5>
                <p className="mt-0.5 text-[11px] text-slate-500">An origin or residence appears in a family view only when both your profile and that place allow sharing. Shared and Public currently have the same effect; Public does not create a web listing.</p>
                {privacyRecordsLoading ? (
                  <p className="mt-2 text-[11px] text-slate-500">Loading your place links…</p>
                ) : placeConnections.length ? (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {placeConnections.map((place) => (
                      <li key={place.connectionId} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-800">{place.name}, {place.country}</p>
                          <p className="truncate text-[10px] text-slate-500">{place.humanLabel || place.connectionType}</p>
                        </div>
                        <select
                          aria-label={`Sharing for ${place.name}, ${place.country}`}
                          value={place.visibility}
                          disabled={savingPlaceConnectionId === place.connectionId}
                          onChange={(event) => void handlePlaceVisibilityChange(place, event.target.value as VisibilitySetting)}
                          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] disabled:opacity-60"
                        >
                          <option value="private">Private</option>
                          <option value="shared">Shared with family</option>
                          <option value="public">Public</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">You have no connected place records.</p>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h5 className="text-xs font-bold text-slate-800">Community connections</h5>
                <p className="mt-0.5 text-[11px] text-slate-500">These links are private to your account in the current app. Community sharing is not enabled yet.</p>
                {privacyRecordsLoading ? (
                  <p className="mt-2 text-[11px] text-slate-500">Loading your community links…</p>
                ) : communityConnections.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {communityConnections.map((community) => (
                      <li key={community.connectionId} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-slate-700">{community.name}</span>
                        <span className="shrink-0 text-[10px] font-medium text-slate-500">Private</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">You have no connected community records.</p>
                )}
              </div>
              {privacyRecordsError && <p className="text-xs text-red-600" role="alert">{privacyRecordsError}</p>}
            </div>
          )}

          {/* 2. Account Details */}
          {activeSection === 'account' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Your Account Details</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Core identity record stored in Cloud SQL.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Full Name</span>
                  <span className="text-slate-900 font-bold">
                    {userOverview?.person?.firstName} {userOverview?.person?.lastName}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500 font-medium">Email Address</span>
                  <span className="text-slate-900 font-bold">{userOverview?.user.email}</span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500 font-medium">Account Status</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 capitalize">
                    {userOverview?.user.status || 'Active'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500 font-medium">System Role</span>
                  <span className="text-slate-900 font-semibold capitalize">
                    {userOverview?.user.role || 'Member'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500 font-medium">Database Persistence</span>
                  <span className="inline-flex items-center text-slate-600 font-medium space-x-1">
                    <Database className="w-3 h-3 text-emerald-600" />
                    <span>Cloud SQL (europe-west2)</span>
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEditProfile();
                  }}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-2xs"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Edit Profile Details</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. Preferences */}
          {activeSection === 'preferences' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Kinship & Discovery Preferences</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure proactive hints and automatic relative discovery notifications.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Family Suggestions</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Suggest potential relatives matching your ancestral places and surnames.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscoveryNotifications(!discoveryNotifications)}
                    className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                      discoveryNotifications ? 'bg-[#05224C]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        discoveryNotifications ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Invitation & Match Alerts</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Show badges when a relative generates an invitation link or claims a link.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alertsEnabled}
                    aria-label="Invitation and match alerts"
                    disabled={savingMatchAlerts}
                    onClick={handleToggleMatchAlerts}
                    className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none disabled:opacity-60 ${
                      alertsEnabled ? 'bg-[#05224C]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        alertsEnabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
                {matchAlertsError && <p role="alert" className="text-xs text-red-600">{matchAlertsError}</p>}
              </div>
            </div>
          )}

          {/* 4. Data Sovereignty */}
          {activeSection === 'data' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Data Control & Rights</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete ownership and portability over your personal information.
                </p>
              </div>

              {exportSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{exportSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Export Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 mb-1">
                      <Download className="w-4 h-4 text-sky-700" />
                      <span>Export My Data</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Download a complete structured JSON archive of your profile, relationships, and places.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={handleExportData}
                    className="mt-3 w-full py-2 px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition shadow-2xs text-center disabled:opacity-50"
                  >
                    {exporting ? 'Preparing archive...' : 'Download JSON Archive'}
                  </button>
                </div>

                {/* Delete Card */}
                <div className="p-4 rounded-xl border border-red-200 bg-red-50/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-2 text-xs font-bold text-red-900 mb-1">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span>Delete My Data</span>
                    </div>
                    <p className="text-[11px] text-red-700 leading-relaxed">
                      Permanently wipe your account, person node, and lineage links from the platform.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeleteAccount();
                    }}
                    className="mt-3 w-full py-2 px-3 rounded-xl bg-white border border-red-300 hover:bg-red-50 text-xs font-semibold text-red-700 transition shadow-2xs text-center"
                  >
                    Delete My Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
