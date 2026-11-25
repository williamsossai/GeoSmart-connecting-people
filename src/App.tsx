import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthContext.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { Navigation } from './components/Navigation.tsx';
import { OnboardingModal } from './components/OnboardingModal.tsx';
import { HomeOverview } from './components/HomeOverview.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { FamilyView } from './components/FamilyView.tsx';
import { CommunityView } from './components/CommunityView.tsx';
import { PlaceView } from './components/PlaceView.tsx';
import { AdminConsole } from './components/AdminConsole.tsx';
import { DeleteAccountModal } from './components/DeleteAccountModal.tsx';
import { EditProfileModal } from './components/EditProfileModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { WorkspaceNavigation } from './components/WorkspaceNavigation.tsx';
import { InvitationNotificationsProvider } from './components/InvitationNotificationsContext.tsx';
import { ConnectivityBanner } from './components/ConnectivityBanner.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import {
  FamilySubView,
  getWorkspacePath,
  getWorkspaceRoute,
  WorkspaceRoute,
  WorkspaceSection,
} from './lib/workspace-routes.ts';
import { ShieldCheck, Database, MailCheck } from 'lucide-react';

const readLocation = () => {
  let pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const knownRoutes = new Set(['/', '/profile', '/family', '/family/tree', '/family/groups', '/family/invitations', '/family/stories', '/community', '/place', '/admin']);
  if (!knownRoutes.has(pathname)) {
    window.history.replaceState(null, '', '/');
    pathname = '/';
  }
  return {
    isAdminRoute: pathname === '/admin',
    workspaceRoute: getWorkspaceRoute(pathname),
  };
};

const MainAppContent: React.FC = () => {
  const {
    currentUser,
    loading,
    emailVerificationRequired,
    userOverview,
    refreshOverview,
    serviceError,
    resendVerificationEmail,
    checkVerification,
    signOut,
  } = useAuth();
  const [locationState, setLocationState] = useState(readLocation);
  const [visitedSections, setVisitedSections] = useState<Set<WorkspaceSection>>(
    () => new Set([readLocation().workspaceRoute.section]),
  );
  const { isAdminRoute, workspaceRoute } = locationState;
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);

  useEffect(() => {
    const syncRoute = () => {
      const next = readLocation();
      setLocationState(next);
      if (!next.isAdminRoute) {
        setVisitedSections((visited) => new Set(visited).add(next.workspaceRoute.section));
      }
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const navigateTo = (section: WorkspaceSection, familyView: FamilySubView = 'overview') => {
    const next: WorkspaceRoute = { section, familyView: section === 'family' ? familyView : 'overview' };
    const path = getWorkspacePath(section, next.familyView);
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setLocationState({ isAdminRoute: false, workspaceRoute: next });
    setVisitedSections((visited) => new Set(visited).add(section));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#05224C] text-sky-300 font-bold flex items-center justify-center animate-pulse text-lg shadow-md">
          GS
        </div>
        <p className="text-sm font-medium text-slate-500">Connecting to GeoSmart Foundation...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthModal />;
  }

  if (emailVerificationRequired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-md">
          <div className="w-12 h-12 rounded-full bg-sky-50 text-[#05224C] flex items-center justify-center mx-auto">
            <MailCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Verify your email address</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            We sent a verification link to <span className="font-semibold text-slate-800">{currentUser.email}</span>.
            Please verify your email to unlock your GeoSmart relationship records.
          </p>
          {verificationNotice && (
            <p className="text-xs rounded-lg bg-sky-50 border border-sky-200 text-sky-900 px-3 py-2">
              {verificationNotice}
            </p>
          )}
          <div className="flex flex-col space-y-2 pt-2">
            <button
              type="button"
              disabled={verificationBusy}
              onClick={async () => {
                setVerificationBusy(true);
                setVerificationNotice(null);
                try {
                  const verified = await checkVerification();
                  if (!verified) {
                    setVerificationNotice('Your email is not marked verified yet. Click the link in your inbox and try again.');
                  }
                } catch (err: any) {
                  setVerificationNotice(err?.message || 'Could not refresh verification status.');
                } finally {
                  setVerificationBusy(false);
                }
              }}
              className="rounded-lg bg-[#05224C] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#07306b] disabled:opacity-60"
            >
              I&apos;ve verified my email — Continue
            </button>
            <button
              type="button"
              disabled={verificationBusy}
              onClick={async () => {
                setVerificationBusy(true);
                setVerificationNotice(null);
                try {
                  await resendVerificationEmail();
                  setVerificationNotice('Verification email sent. Check your inbox and spam folder.');
                } catch (err: any) {
                  setVerificationNotice(err?.message || 'Could not send verification email.');
                } finally {
                  setVerificationBusy(false);
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Resend verification email
            </button>
            <button
              type="button"
              disabled={verificationBusy}
              onClick={() => void signOut()}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 pt-1"
            >
              Sign out or use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (serviceError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-3 shadow-md">
          <h2 className="text-xl font-bold text-slate-900">We couldn’t load your account</h2>
          <p className="text-sm text-slate-600">{serviceError}</p>
          <button
            type="button"
            onClick={() => void refreshOverview()}
            className="mt-3 rounded-lg bg-[#05224C] px-4 py-2 text-sm font-medium text-white hover:bg-[#07306b]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // If user is suspended
  if (userOverview?.user.status === 'suspended') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4 shadow-md">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            ✕
          </div>
          <h2 className="text-xl font-bold text-slate-900">Account Suspended</h2>
          <p className="text-sm text-slate-600">
            This account is currently restricted for administrative or compliance reasons. Please contact platform support.
          </p>
        </div>
      </div>
    );
  }

  // The admin console is served only from /admin and never appears in the
  // regular user's navigation or application view.
  if (isAdminRoute) {
    if (userOverview?.user.role !== 'admin') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4 shadow-md">
            <h1 className="text-xl font-bold text-slate-900">Admin access required</h1>
            <p className="text-sm text-slate-600">This area is restricted to GeoSmart administrators.</p>
            <a href="/" className="inline-flex rounded-lg bg-[#05224C] px-4 py-2 text-sm font-medium text-white hover:bg-[#07306b]">
              Return to GeoSmart
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800">
        <header className="bg-[#05224C] text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <span className="font-bold">GeoSmart · Administration</span>
            <a href="/" className="text-sm text-sky-200 hover:text-white">Return to app</a>
          </div>
        </header>
        <AdminConsole />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 font-sans text-slate-800">
      <Navigation
        onNavigate={(tab) => navigateTo(tab === 'home' ? 'overview' : 'profile')}
        onOpenEditProfile={() => setIsEditProfileModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenDeleteAccount={() => setIsDeleteModalOpen(true)}
      />

      {/* Progressive 9-Step Onboarding Modal if user hasn't completed it yet */}
      {userOverview && !userOverview.user.onboardingCompleted && (
        <OnboardingModal onComplete={() => refreshOverview()} />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <WorkspaceNavigation route={workspaceRoute} onNavigate={navigateTo} />

        {/* The selected view is the central preview pane. Visited sections stay mounted so their local UI state survives navigation. */}
        <main
          id="workspace-preview"
          aria-label="Selected workspace preview"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-6 lg:pb-0"
        >
          {visitedSections.has('overview') && (
            <section hidden={workspaceRoute.section !== 'overview'} aria-label="Overview preview" className="min-h-full">
              <HomeOverview onNavigate={(tab) => navigateTo(tab)} />
            </section>
          )}
          {visitedSections.has('profile') && (
            <section hidden={workspaceRoute.section !== 'profile'} aria-label="Profile preview" className="min-h-full">
              <ProfileView onNavigate={(tab) => navigateTo(tab)} />
            </section>
          )}
          {visitedSections.has('family') && (
            <section hidden={workspaceRoute.section !== 'family'} aria-label="Family preview" className="min-h-full">
              <FamilyView
                activeSubView={workspaceRoute.familyView}
                onSubViewChange={(view) => navigateTo('family', view)}
              />
            </section>
          )}
          {visitedSections.has('community') && (
            <section hidden={workspaceRoute.section !== 'community'} aria-label="Community preview" className="min-h-full">
              <CommunityView />
            </section>
          )}
          {visitedSections.has('place') && (
            <section hidden={workspaceRoute.section !== 'place'} aria-label="Place preview" className="min-h-full">
              <PlaceView />
            </section>
          )}
        </main>
      </div>

      {/* Profile & Account Modals */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenEditProfile={() => {
          setIsSettingsModalOpen(false);
          setIsEditProfileModalOpen(true);
        }}
        onOpenDeleteAccount={() => {
          setIsSettingsModalOpen(false);
          setIsDeleteModalOpen(true);
        }}
      />

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />

      {/* Subdued Footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[#05224C]">GeoSmart</span>
            <span>·</span>
            <span>Individual Relationship Foundation</span>
          </div>

          <div className="flex items-center space-x-4 text-[11px] text-slate-400">
            <span className="flex items-center space-x-1">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cloud Firestore</span>
            </span>
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
              <span>Verified Identity Engine</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <InvitationNotificationsProvider>
          <>
            <ConnectivityBanner />
            <MainAppContent />
          </>
        </InvitationNotificationsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
