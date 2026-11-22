import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, Home, MapPin, UserRound, Users } from 'lucide-react';
import { useInvitationNotifications } from './InvitationNotificationsContext.tsx';
import {
  FamilySubView,
  getWorkspacePath,
  WorkspaceRoute,
  WorkspaceSection,
  workspaceSections,
} from '../lib/workspace-routes.ts';

interface WorkspaceNavigationProps {
  route: WorkspaceRoute;
  onNavigate: (section: WorkspaceSection, familyView?: FamilySubView) => void;
}

const icons = {
  overview: Home,
  profile: UserRound,
  family: Users,
  community: Compass,
  place: MapPin,
};

const sectionTabs: Record<WorkspaceSection, Array<{ id: FamilySubView; label: string; hint: string }>> = {
  overview: [{ id: 'overview', label: 'Summary', hint: 'Your relationship overview' }],
  profile: [{ id: 'overview', label: 'Profile details', hint: 'Your personal profile' }],
  family: [
    { id: 'overview', label: 'Family overview', hint: 'Connections and relatives' },
    { id: 'tree', label: 'Family tree', hint: 'Explore your family tree' },
    { id: 'invitations', label: 'Invitations', hint: 'Pending invitations and recent activity' },
  ],
  community: [{ id: 'overview', label: 'Communities', hint: 'Your connected communities' }],
  place: [{ id: 'overview', label: 'Places', hint: 'Your geographic story' }],
};

const followLink = (
  event: React.MouseEvent<HTMLAnchorElement>,
  onNavigate: () => void,
) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onNavigate();
};

export const WorkspaceNavigation: React.FC<WorkspaceNavigationProps> = ({ route, onNavigate }) => {
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const { pendingCount, hasUnreadActivity, alertsEnabled } = useInvitationNotifications();
  const showInvitationActivity = alertsEnabled && hasUnreadActivity;
  const tabs = sectionTabs[route.section];
  const activeSectionLabel = workspaceSections.find((item) => item.id === route.section)?.label || 'Section';
  const activeFamilyView = route.section === 'family' ? route.familyView : 'overview';

  const navigateFromPrimary = (section: WorkspaceSection) => {
    const sameSection = section === route.section;
    onNavigate(section);
    setIsSecondaryOpen((isOpen) => (sameSection ? !isOpen : true));
  };

  const renderPrimaryLinks = (compact = false) => (
    <nav
      aria-label="Primary menu"
      className={compact
        ? 'flex min-w-max items-center gap-1 px-2 py-2'
        : 'space-y-1'}
    >
      {workspaceSections.map((section) => {
        const Icon = icons[section.id];
        const selected = route.section === section.id;
        const href = getWorkspacePath(section.id);
        return (
          <a
            key={section.id}
            href={href}
            aria-current={selected ? 'page' : undefined}
            aria-expanded={selected ? isSecondaryOpen : undefined}
            aria-controls={selected && isSecondaryOpen
              ? compact ? 'secondary-menu-compact' : 'secondary-menu-desktop'
              : undefined}
            onClick={(event) => followLink(event, () => navigateFromPrimary(section.id))}
            className={compact
              ? `flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${selected ? 'bg-white/15 text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`
              : `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${selected ? 'bg-[#05224C] text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="relative inline-flex items-center gap-1.5">
              {section.label}
              {section.id === 'family' && showInvitationActivity && (
                <>
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-300 ring-2 ring-current/20" />
                  <span className="sr-only">New invitation activity</span>
                </>
              )}
            </span>
          </a>
        );
      })}
    </nav>
  );

  const renderSecondaryLinks = (compact = false) => (
    <nav
      id={compact ? 'secondary-menu-compact' : 'secondary-menu-desktop'}
      aria-label={`${workspaceSections.find((item) => item.id === route.section)?.label} menu`}
      className={compact
        ? 'flex min-w-max items-center gap-2 px-3 py-2'
        : 'space-y-1'}
    >
      {tabs.map((tab) => {
        const selected = activeFamilyView === tab.id;
        const href = getWorkspacePath(route.section, tab.id);
        return (
          <a
            key={tab.id}
            href={href}
            aria-current={selected ? 'page' : undefined}
            onClick={(event) => followLink(event, () => onNavigate(route.section, tab.id))}
            className={compact
              ? `whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05224C] ${selected ? 'border-[#05224C] bg-[#05224C] text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`
              : `block rounded-xl px-3 py-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05224C] ${selected ? 'bg-sky-50 text-[#05224C] ring-1 ring-sky-200' : 'text-slate-700 hover:bg-white'}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="block text-sm font-semibold">{tab.label}</span>
              {tab.id === 'invitations' && (
                <span className="inline-flex items-center gap-1.5">
                  {showInvitationActivity && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />}
                  {pendingCount > 0 && (
                    <span aria-label={`${pendingCount} pending invitations`} className="min-w-5 rounded-full bg-sky-100 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-sky-900">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                  {(showInvitationActivity || pendingCount > 0) && (
                    <span className="sr-only">
                      {showInvitationActivity ? 'New invitation activity. ' : ''}
                      {pendingCount > 0 ? `${pendingCount} pending invitations.` : ''}
                    </span>
                  )}
                </span>
              )}
            </span>
            {!compact && <span className="mt-1 block text-xs text-slate-500">{tab.hint}</span>}
          </a>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Compact navigation for phones and tablets. Each row can scroll without forcing page overflow. */}
      <div className="border-b border-slate-200 bg-[#05224C] lg:hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          {renderPrimaryLinks(true)}
        </div>
      </div>
      <div className="border-b border-slate-200 bg-white lg:hidden">
        <div className="flex min-h-12 items-center gap-2 px-2">
          {isSecondaryOpen && (
            <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
              {renderSecondaryLinks(true)}
            </div>
          )}
          <button
            type="button"
            aria-expanded={isSecondaryOpen}
            aria-controls={isSecondaryOpen ? 'secondary-menu-compact' : undefined}
            onClick={() => setIsSecondaryOpen((isOpen) => !isOpen)}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#05224C] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05224C]"
          >
            {isSecondaryOpen ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            <span>{isSecondaryOpen ? 'Hide' : `Show ${activeSectionLabel} tabs`}</span>
          </button>
        </div>
      </div>

      {/* The primary menu stays visible while the contextual secondary pane expands beside it. */}
      <div className="hidden shrink-0 lg:flex">
        <aside className="w-56 border-r border-slate-200 bg-white px-4 py-6">
          <div className="mb-4 flex items-center justify-between px-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Primary menu</h2>
            <button
              type="button"
              aria-label={isSecondaryOpen ? 'Collapse secondary menu' : 'Expand secondary menu'}
              aria-expanded={isSecondaryOpen}
              aria-controls={isSecondaryOpen ? 'secondary-menu-desktop' : undefined}
              onClick={() => setIsSecondaryOpen((isOpen) => !isOpen)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-[#05224C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05224C]"
            >
              {isSecondaryOpen ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {renderPrimaryLinks()}
        </aside>
        {isSecondaryOpen && (
          <aside className="w-56 border-r border-slate-200 bg-slate-50/80 px-4 py-6">
            <div className="mb-1 flex items-center justify-between px-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{activeSectionLabel}</h2>
              <button
                type="button"
                aria-label="Collapse secondary menu"
                onClick={() => setIsSecondaryOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-[#05224C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05224C]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mb-4 px-3 text-xs text-slate-500">Choose a view</p>
            {renderSecondaryLinks()}
          </aside>
        )}
      </div>
    </>
  );
};
