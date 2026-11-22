export type WorkspaceSection = 'overview' | 'profile' | 'family' | 'community' | 'place';
export type FamilySubView = 'overview' | 'tree' | 'invitations';

export interface WorkspaceRoute {
  section: WorkspaceSection;
  familyView: FamilySubView;
}

export const workspaceSections: Array<{
  id: WorkspaceSection;
  label: string;
}> = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Profile' },
  { id: 'family', label: 'Family' },
  { id: 'community', label: 'Community' },
  { id: 'place', label: 'Place' },
];

export const getWorkspacePath = (section: WorkspaceSection, familyView: FamilySubView = 'overview') => {
  if (section === 'overview') return '/';
  if (section === 'family' && familyView === 'tree') return '/family/tree';
  if (section === 'family' && familyView === 'invitations') return '/family/invitations';
  return `/${section}`;
};

export const getWorkspaceRoute = (pathname: string): WorkspaceRoute => {
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0] as WorkspaceSection | undefined;

  if (section === 'profile' || section === 'family' || section === 'community' || section === 'place') {
    return {
      section,
      familyView: section === 'family' && parts[1] === 'tree'
        ? 'tree'
        : section === 'family' && parts[1] === 'invitations'
          ? 'invitations'
          : 'overview',
    };
  }

  return { section: 'overview', familyView: 'overview' };
};
