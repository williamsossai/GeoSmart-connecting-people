import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  Shield,
  Activity,
  Users,
  Compass,
  MapPin,
  Server,
  Database,
  Lock,
  Search,
  AlertTriangle,
  CheckCircle,
  FileText,
  Clock,
  RotateCw,
} from 'lucide-react';

export const AdminConsole: React.FC = () => {
  const { idToken, userOverview } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'activity' | 'logs'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Status modal state
  const [targetUser, setTargetUser] = useState<any | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchAllAdminData = async () => {
    if (!idToken) return;
    setRefreshing(true);
    try {
      const [mRes, hRes, aRes, uRes, lRes] = await Promise.all([
        fetch('/api/admin/metrics?reason=Admin+Console+Dashboard+Load', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch('/api/admin/health', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch('/api/admin/activity?limit=40', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch(`/api/admin/users?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch('/api/admin/logs', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);

      if (mRes.ok) setMetrics(await mRes.json());
      if (hRes.ok) setHealth(await hRes.json());
      if (aRes.ok) setActivity(await aRes.json());
      if (uRes.ok) setUsersList(await uRes.json());
      if (lRes.ok) setLogs(await lRes.json());
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllAdminData();
  }, [idToken]);

  const handleSearchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) setUsersList(await res.json());
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleUpdateStatus = async () => {
    if (!targetUser || !actionReason.trim() || !idToken) return;
    setActionSubmitting(true);
    const newStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          status: newStatus,
          reason: actionReason.trim(),
        }),
      });

      if (res.ok) {
        setTargetUser(null);
        setActionReason('');
        await fetchAllAdminData();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setActionSubmitting(false);
    }
  };

  if (userOverview?.user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-2xl border border-red-200 text-center space-y-4">
        <Lock className="w-10 h-10 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">
          The GeoSmart Admin Console requires verified platform administrator credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              RESTRICTED
            </span>
            <span className="text-xs text-slate-500">Administrator access</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#05224C] tracking-tight mt-1">
            GeoSmart Admin Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational visibility, system health telemetry, user account controls, and audit logs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchAllAdminData}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-2xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex space-x-4">
        {[
          { id: 'overview' as const, label: 'Platform & Health' },
          { id: 'users' as const, label: 'User Governance' },
          { id: 'activity' as const, label: 'Activity Stream' },
          { id: 'logs' as const, label: 'Admin Audit Logs' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
              activeTab === tab.id
                ? 'border-[#05224C] text-[#05224C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Overview & System Health */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Health Telemetry Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center space-x-3">
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">PostgreSQL Database</p>
                <p className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${health?.database === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span>{health?.database === 'healthy' ? `Healthy (${health.dbLatencyMs}ms)` : 'Unavailable'}</span>
                </p>
                <p className="text-[11px] text-slate-400">GeoSmart account storage</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center space-x-3">
              <div className="p-2.5 rounded-lg bg-sky-50 text-sky-700">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Firebase Auth</p>
                <p className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Operational</span>
                </p>
                <p className="text-[11px] text-slate-400">Google sign-in token verification</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center space-x-3">
              <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">Server Uptime</p>
                <p className="text-sm font-bold text-slate-900">
                  {health?.serverUptimeSeconds ? `${Math.floor(health.serverUptimeSeconds / 60)}m ${health.serverUptimeSeconds % 60}s` : 'Active'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {health?.recentErrorCount == null ? 'Error tracking not configured' : `${health.recentErrorCount} recent error events`}
                </p>
              </div>
            </div>
          </div>

          {/* Platform Metrics Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Platform Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Registered Users</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.registeredUsers || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Active Users</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {metrics?.activeUsers || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Families Formed</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.familiesCount || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Relationships</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.relationshipsCount || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Communities</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.communitiesCount || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Unique Places</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.placesCount || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Countries Represented</p>
                <p className="text-2xl font-bold text-sky-700 mt-1">
                  {metrics?.countriesRepresented || 0}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Security Audit Logs</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">
                  {logs?.length || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Phase 2: Family Tree & Kinship Network Health */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Phase 2: Family Tree Health & Kinship Growth</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-generational tree generation, unclaimed person bridging, and invitation claiming velocity.
                </p>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                Phase 2 Metrics
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200">
                <p className="text-xs text-sky-900 font-medium">Active Family Trees</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.activeFamilyTreesCount || 0}
                </p>
                <p className="text-[10px] text-sky-700 mt-1">Users with visual trees</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-600 font-medium">Avg Tree Connections</p>
                <p className="text-2xl font-bold text-[#05224C] mt-1">
                  {metrics?.averageFamilyTreeSize || 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Relatives per user tree</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-600 font-medium">Pending Invitations</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {metrics?.activeInvitationsCount || 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Unexpired invitations</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <p className="text-xs text-emerald-900 font-medium">Accepted Invitations</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {metrics?.claimedInvitationsCount || 0}
                </p>
                <p className="text-[10px] text-emerald-700 mt-1">Linked relative accounts</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. User Governance */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">User Account Directory</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit account status, identity links, and apply administrative controls.
              </p>
            </div>

            <form onSubmit={handleSearchUsers} className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by email or name..."
                  className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05224C] w-64"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#05224C] text-white text-xs font-semibold"
              >
                Search
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Name / Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Onboarded</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 font-mono font-bold text-[#05224C]">#{u.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{u.displayName || 'Unnamed User'}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                    </td>
                    <td className="p-3 capitalize font-medium">{u.role}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {u.onboardingCompleted ? (
                        <span className="text-emerald-600 font-medium">Completed</span>
                      ) : (
                        <span className="text-slate-400 italic">Pending</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => {
                            setTargetUser(u);
                            setActionReason('');
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                            u.status === 'active'
                              ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          }`}
                        >
                          {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Activity Stream */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900">Recent Platform Activity</h2>
          <div className="space-y-3">
            {activity.map((ev) => (
              <div
                key={ev.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  <div>
                    <span className="font-mono font-bold text-[#05224C] mr-2">
                      {ev.eventType}
                    </span>
                    <span className="text-slate-700">{ev.eventDescription}</span>
                  </div>
                </div>
                <span className="text-slate-400 text-[11px]">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Admin Audit Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-[#05224C]" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Mandatory Access Audit Log</h2>
              <p className="text-xs text-slate-500">
                All administrative access, queries, and state changes are recorded with operator reason.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {logs.map((l) => (
              <div
                key={l.id}
                className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-slate-800">{l.action}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-600">Reason: "{l.reason}"</span>
                </div>
                <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
                  <span>Admin ID: #{l.adminUserId}</span>
                  <span>{new Date(l.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandatory Reason Modal for Suspend/Reactivate */}
      {targetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center space-x-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Administrative Account Action</h3>
            </div>
            <p className="text-xs text-slate-600">
              You are altering the account status of{' '}
              <strong>{targetUser.email}</strong> to{' '}
              <strong>{targetUser.status === 'active' ? 'suspended' : 'active'}</strong>.
              A clear operational justification is mandatory for compliance audit logs.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Operational Reason (Mandatory)
              </label>
              <textarea
                rows={3}
                required
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="e.g. Terms violation review or support reactivation request"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setTargetUser(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!actionReason.trim() || actionSubmitting}
                onClick={handleUpdateStatus}
                className="px-4 py-1.5 rounded-lg bg-[#05224C] text-white text-xs font-semibold disabled:opacity-50"
              >
                {actionSubmitting ? 'Recording...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
