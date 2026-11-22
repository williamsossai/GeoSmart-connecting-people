import React, { useState, useRef, useEffect } from 'react';
import {
  LogOut,
  ChevronDown,
  Edit3,
  Settings,
  Download,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from './AuthContext.tsx';

interface NavigationProps {
  onNavigate: (tab: 'home' | 'profile') => void;
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onOpenDeleteAccount: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  onNavigate,
  onOpenEditProfile,
  onOpenSettings,
  onOpenDeleteAccount,
}) => {
  const { currentUser, userOverview, idToken, signOut } = useAuth();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  const firstName = userOverview?.person?.firstName || '';
  const lastName = userOverview?.person?.lastName || '';
  const displayName = userOverview?.user.displayName || (firstName ? `${firstName} ${lastName}`.trim() : currentUser?.email?.split('@')[0] || 'Profile');
  const userEmail = userOverview?.user.email || currentUser?.email || '';

  // Avatar initials
  const initials = firstName && lastName
    ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
    : displayName.substring(0, 2).toUpperCase();

  const handleExportData = async () => {
    if (!idToken) return;
    setIsExporting(true);
    setExportFeedback(null);
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
      setExportFeedback({ type: 'success', message: 'Data archive downloaded.' });
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (err) {
      console.error('Error exporting data:', err);
      setExportFeedback({ type: 'error', message: 'Failed to generate archive.' });
      setTimeout(() => setExportFeedback(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <header className="relative z-30 shrink-0 bg-[#05224C] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <button
              onClick={() => onNavigate('home')}
              aria-label="GeoSmart overview"
              className="group flex items-center space-x-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
            >
              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-sky-300 font-bold tracking-wider group-hover:bg-white/20 transition">
                GS
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white">GeoSmart</span>
                <span className="hidden sm:inline-block ml-2 text-xs text-sky-200 font-medium px-2 py-0.5 rounded bg-white/15">
                  Relationship Foundation
                </span>
              </div>
            </button>

          </div>

          {/* Right Action Items */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Profile Button with Dropdown Menu */}
            {currentUser && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  aria-expanded={isProfileMenuOpen}
                  aria-label="User Profile and Account Menu"
                  className={`flex items-center space-x-2.5 py-1.5 px-2.5 sm:px-3 rounded-xl border transition ${
                    isProfileMenuOpen
                      ? 'bg-white/20 border-white/30 text-white shadow-inner'
                      : 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-100'
                  }`}
                >
                  {/* Initials Avatar */}
                  <div className="w-7 h-7 rounded-lg bg-sky-300 text-[#05224C] font-bold text-xs flex items-center justify-center shadow-xs">
                    {initials}
                  </div>

                  {/* Profile Label */}
                  <span className="text-xs font-semibold max-w-[120px] truncate hidden sm:inline">
                    {displayName}
                  </span>

                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${
                      isProfileMenuOpen ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-slate-800 animate-in fade-in zoom-in-95">
                    {/* User Profile Header */}
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-[#05224C] text-white font-bold text-sm flex items-center justify-center shadow-xs flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {displayName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {userEmail}
                        </p>
                        <button
                          onClick={() => {
                            onNavigate('profile');
                            setIsProfileMenuOpen(false);
                          }}
                          className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 mt-1 inline-block"
                        >
                          View Profile →
                        </button>
                      </div>
                    </div>

                    {/* Feedback message if exporting */}
                    {exportFeedback && (
                      <div className="mx-3 my-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                        {exportFeedback.type === 'success' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                        )}
                        <span className="text-[11px] font-medium">{exportFeedback.message}</span>
                      </div>
                    )}

                    {/* Menu Items */}
                    <div className="py-1">
                      {/* 1. Edit Profile */}
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenEditProfile();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center space-x-2.5 transition"
                      >
                        <Edit3 className="w-4 h-4 text-slate-500" />
                        <span>Edit Profile</span>
                      </button>

                      {/* 2. Settings */}
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenSettings();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center space-x-2.5 transition"
                      >
                        <Settings className="w-4 h-4 text-slate-500" />
                        <span>Settings</span>
                      </button>

                      {/* 3. Export My Data */}
                      <button
                        disabled={isExporting}
                        onClick={handleExportData}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition disabled:opacity-60"
                      >
                        <div className="flex items-center space-x-2.5">
                          <Download className="w-4 h-4 text-slate-500" />
                          <span>Export My Data</span>
                        </div>
                        {isExporting && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />}
                      </button>
                    </div>

                    <div className="border-t border-slate-100 my-1" />

                    {/* Destructive & Session Actions */}
                    <div className="py-1">
                      {/* 4. Delete My Data */}
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenDeleteAccount();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2.5 transition"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                        <span>Delete My Data</span>
                      </button>

                      {/* 5. Log Out */}
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          signOut();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center space-x-2.5 transition"
                      >
                        <LogOut className="w-4 h-4 text-slate-500" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </header>
  );
};
