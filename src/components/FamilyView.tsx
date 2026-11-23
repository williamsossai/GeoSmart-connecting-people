import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  Users,
  Plus,
  Trash2,
  MapPin,
  Lock,
  Share2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Layers,
  LayoutGrid,
  GitFork,
  GitBranch,
  Mail,
} from 'lucide-react';
import type {
  FamilyMemberWithPerson,
  FamilyTreeGraph,
  FamilyTreeNode,
  RelationshipType,
} from '../types.ts';
import { FamilyTreeCanvas } from './FamilyTreeCanvas.tsx';
import { FamilyMemberDetailModal } from './FamilyMemberDetailModal.tsx';
import { KinshipDiscoveryBanner } from './KinshipDiscoveryBanner.tsx';
import { FamilyInvitationsModal } from './FamilyInvitationsModal.tsx';
import { FamilyStoriesView } from './FamilyStoriesView.tsx';
import { useInvitationNotifications } from './InvitationNotificationsContext.tsx';
import { familyGenderOptions, getRelationshipLabel, getRelationshipOptions } from '../lib/family-relationships.ts';
import {
  addFamilyMemberFs,
  getUserFamilyFs,
  getUserFamilyTreeFs,
  removeRelationshipFs,
} from '../lib/firestore-repo.ts';

interface FamilyViewProps {
  activeSubView?: 'overview' | 'tree' | 'invitations' | 'stories';
  onSubViewChange?: (view: 'overview' | 'tree' | 'invitations' | 'stories') => void;
}

type FamilyOverviewView =
  | 'all'
  | 'spouse'
  | 'spouse_children'
  | 'children'
  | 'parents_siblings'
  | 'siblings'
  | 'ancestors'
  | 'descendants'
  | 'extended';

interface FamilyOverviewHierarchyTier {
  label: string;
  members: FamilyMemberWithPerson[];
  includeSelf?: boolean;
  connectsToPrevious?: boolean;
  note?: string;
}

const familyOverviewViews: Array<{ id: FamilyOverviewView; label: string }> = [
  { id: 'all', label: 'All connections' },
  { id: 'spouse', label: 'Spouse / partner' },
  { id: 'spouse_children', label: 'Spouse / partner and children' },
  { id: 'children', label: 'Children' },
  { id: 'parents_siblings', label: 'Parents and siblings' },
  { id: 'siblings', label: 'Siblings' },
  { id: 'ancestors', label: 'Ancestors' },
  { id: 'descendants', label: 'Descendants' },
  { id: 'extended', label: 'Extended family' },
];

const familyOverviewRelationships: Record<FamilyOverviewView, RelationshipType[] | null> = {
  all: null,
  spouse: ['spouse'],
  spouse_children: ['spouse', 'child'],
  children: ['child'],
  parents_siblings: ['parent', 'sibling'],
  siblings: ['sibling'],
  ancestors: ['parent', 'grandparent'],
  descendants: ['child', 'grandchild'],
  extended: ['relative', 'other'],
};

export const FamilyView: React.FC<FamilyViewProps> = ({ activeSubView, onSubViewChange }) => {
  const { currentUser, idToken, refreshOverview } = useAuth();
  const { pendingCount, hasUnreadActivity, alertsEnabled, markInvitationActivityRead, refreshInvitationNotifications } = useInvitationNotifications();

  // Sub-view: 'overview' (My Family page with Family Overview) vs 'tree' (visual tree entry point)
  const [internalSubView, setInternalSubView] = useState<'overview' | 'tree' | 'invitations' | 'stories'>('overview');
  const subView = activeSubView ?? internalSubView;
  const setSubView = (view: 'overview' | 'tree' | 'invitations' | 'stories') => {
    if (activeSubView === undefined) setInternalSubView(view);
    onSubViewChange?.(view);
  };

  // Keep the three tree presentations together in one page-level selector.
  const [familyDisplayMode, setFamilyDisplayMode] = useState<'tree' | 'lineage' | 'list'>('tree');
  const [cardDensity, setCardDensity] = useState<'compact' | 'comfortable'>('compact');
  const [familyOverviewView, setFamilyOverviewView] = useState<FamilyOverviewView>('all');

  // Data states
  const [treeData, setTreeData] = useState<FamilyTreeGraph | null>(null);
  const [members, setMembers] = useState<FamilyMemberWithPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInvitationsModal, setShowInvitationsModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FamilyTreeNode | null>(null);

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // In-app Disconnect Confirmation Modal
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: number; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Add Member Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [gender, setGender] = useState('unspecified');
  const [isLiving, setIsLiving] = useState(true);
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [originPlaceName, setOriginPlaceName] = useState('');
  const [originPlaceCountry, setOriginPlaceCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('parent');
  const [submitting, setSubmitting] = useState(false);

  const resetAddForm = () => {
    setFirstName('');
    setLastName('');
    setOtherNames('');
    setGender('unspecified');
    setIsLiving(true);
    setBirthDate('');
    setDeathDate('');
    setOriginPlaceName('');
    setOriginPlaceCountry('');
    setNotes('');
    setRelationshipType('parent');
  };

  // Load Tree & Members
  const loadFamilyData = async (): Promise<FamilyTreeGraph | null> => {
    if (!currentUser?.uid) return null;
    setLoading(true);
    try {
      const [tData, lData] = await Promise.all([
        getUserFamilyTreeFs(currentUser.uid),
        getUserFamilyFs(currentUser.uid),
      ]);
      setTreeData(tData);
      setMembers(lData);
      return tData;
    } catch (err) {
      console.error('Failed to load family data:', err);
      setErrorMsg('Failed to load family connections.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamilyData();
  }, [currentUser?.uid]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await addFamilyMemberFs(currentUser.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        otherNames: !isLiving ? otherNames.trim() || null : null,
        gender,
        isLiving,
        birthDate: !isLiving ? birthDate.trim() || null : null,
        deathDate: !isLiving ? deathDate.trim() || null : null,
        relationshipType,
        originPlace:
          !isLiving && (originPlaceName.trim() || originPlaceCountry.trim())
            ? {
                name: originPlaceName.trim(),
                country: originPlaceCountry.trim(),
              }
            : undefined,
        notes: !isLiving ? notes.trim() || null : null,
      });

      await loadFamilyData();
      await refreshOverview();
      setShowAddModal(false);
      resetAddForm();
      setSuccessMsg('Family member connected successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error adding family member:', err);
      setErrorMsg(err.message || 'Failed to connect family member.');
    } finally {
      setSubmitting(false);
    }
  };

  const executeRemove = async (relationshipIdOrPersonId: number, memberName: string) => {
    if (!currentUser?.uid) return;

    try {
      await removeRelationshipFs(currentUser.uid, relationshipIdOrPersonId);
      await loadFamilyData();
      await refreshOverview();
      setSelectedNode(null);
      setSuccessMsg(`Disconnected ${memberName} from your family tree.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Error removing connection:', err);
      setErrorMsg(err.message || 'Failed to remove connection.');
      setTimeout(() => setErrorMsg(null), 4000);
      throw err;
    }
  };

  const handleRemove = async (relationshipIdOrPersonId: number, memberName: string) => {
    await executeRemove(relationshipIdOrPersonId, memberName);
  };

  const openInvitations = () => {
    setShowInvitationsModal(true);
  };

  // Group members for list view
  const parents = members.filter((m) => m.relationshipType === 'parent');
  const spouses = members.filter((m) => m.relationshipType === 'spouse');
  const children = members.filter((m) => m.relationshipType === 'child');
  const siblings = members.filter((m) => m.relationshipType === 'sibling');
  const grandparents = members.filter((m) => m.relationshipType === 'grandparent');
  const others = members.filter(
    (m) => !['parent', 'spouse', 'child', 'sibling', 'grandparent'].includes(m.relationshipType)
  );
  const overviewRelationshipTypes = familyOverviewRelationships[familyOverviewView];
  const visibleOverviewMembers = overviewRelationshipTypes
    ? members.filter((member) => overviewRelationshipTypes.includes(member.relationshipType))
    : members;
  const familyOverviewHierarchy: FamilyOverviewHierarchyTier[] = (() => {
    const selfTier = (label: string, tierMembers: FamilyMemberWithPerson[] = []): FamilyOverviewHierarchyTier => ({
      label,
      members: tierMembers,
      includeSelf: true,
    });
    const tier = (label: string, tierMembers: FamilyMemberWithPerson[]): FamilyOverviewHierarchyTier => ({
      label,
      members: tierMembers,
    });

    switch (familyOverviewView) {
      case 'spouse':
        return [selfTier('You and your spouse / partner', spouses)];
      case 'spouse_children':
        return [
          selfTier('You and your spouse / partner', spouses),
          { ...tier('Children connected to you', children), note: 'The recorded relationships do not specify which partner is a parent.' },
        ];
      case 'children':
        return [selfTier('You', []), tier('Your children', children)];
      case 'parents_siblings':
        return [
          tier('Generation +1 · Parents', parents),
          selfTier('Your generation · You and siblings', siblings),
        ];
      case 'siblings':
        return [selfTier('You and your siblings', siblings)];
      case 'ancestors':
        return [
          tier('Generation +2 · Grandparents', grandparents),
          tier('Generation +1 · Parents', parents),
          selfTier('You', []),
        ];
      case 'descendants':
        return [
          selfTier('You', []),
          tier('Generation -1 · Children', children),
          tier('Generation -2 · Grandchildren', members.filter((member) => member.relationshipType === 'grandchild')),
        ];
      case 'extended':
        return [
          selfTier('You', []),
          {
            ...tier('Extended family · generation unspecified', members.filter((member) => ['relative', 'other'].includes(member.relationshipType))),
            connectsToPrevious: false,
            note: 'These connections are recorded relative to you, but their exact generation is not specified.',
          },
        ];
      case 'all':
        return [];
    }
  })();

  const connectionsCount = members.length;
  const generationsCount =
    treeData?.summary?.generationsCount ||
    (members.length === 0
      ? 1
      : members.some((m) => m.relationshipType === 'grandparent') &&
        members.some((m) => m.relationshipType === 'child')
      ? 3
      : members.some(
          (m) =>
            m.relationshipType === 'grandparent' ||
            m.relationshipType === 'child' ||
            m.relationshipType === 'parent'
        )
      ? 2
      : 1);

  const renderOverviewMember = (member: FamilyMemberWithPerson) => (
    <div key={member.relationshipId} className="w-full">
      <MemberCard
        member={member}
        onSelect={() => {
          const matched = treeData?.nodes.find((node) => node.personId === member.personId);
          if (matched) setSelectedNode(matched);
        }}
        onRemove={(id, name) => setDisconnectTarget({ id, name })}
      />
    </div>
  );

  const renderSelfAnchor = () => (
    <button
      type="button"
      disabled={!treeData}
      onClick={() => treeData && setSelectedNode(treeData.self)}
      className="flex min-h-[5.5rem] w-full items-center gap-3 rounded-xl border border-sky-300 bg-gradient-to-r from-[#05224C] to-[#083068] p-4 text-left text-white shadow-xs transition hover:brightness-110 disabled:cursor-default"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#05224C]">You</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{treeData ? `${treeData.self.firstName} ${treeData.self.lastName}` : 'You'}</span>
        <span className="mt-0.5 block text-xs text-sky-200">Family anchor</span>
      </span>
    </button>
  );

  const renderHierarchyTier = (tier: FamilyOverviewHierarchyTier, index: number) => {
    const itemCount = tier.members.length + (tier.includeSelf ? 1 : 0);
    const cardsLayout = itemCount === 1
      ? 'mx-auto grid w-full max-w-sm grid-cols-1 gap-3'
      : itemCount === 2
        ? 'mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2'
        : 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3';

    return (
      <React.Fragment key={`${tier.label}-${index}`}>
        {index > 0 && tier.connectsToPrevious !== false && (
          <div aria-hidden="true" className="mx-auto h-7 w-px bg-slate-300" />
        )}
        <section aria-label={tier.label} className="space-y-2">
          <h3 className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">{tier.label}</h3>
          {tier.note && <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-slate-500">{tier.note}</p>}
          {itemCount > 0 ? (
            <div className={cardsLayout}>
              {tier.includeSelf && <div className="w-full">{renderSelfAnchor()}</div>}
              {tier.members.map(renderOverviewMember)}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
              No connections are recorded at this generation.
            </p>
          )}
        </section>
      </React.Fragment>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-6">
      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SUBVIEW 1: Family Tree Visualizer (Sub-view under My Family) */}
      {subView === 'invitations' ? (
        null
      ) : subView === 'stories' ? (
        <FamilyStoriesView />
      ) : subView === 'tree' ? (
        <div className="space-y-6">
          {/* Page hero */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-[#05224C] sm:text-3xl">Family Tree</h1>
              <p className="text-sm text-slate-500">
                Explore your relatives and connections across generations.
              </p>
              <p className="pt-1 text-xs font-medium text-slate-500">
                {connectionsCount} {connectionsCount === 1 ? 'connection' : 'connections'} · {generationsCount} {generationsCount === 1 ? 'generation' : 'generations'}
              </p>
            </div>

            {/* One view selector, followed by the page actions. */}
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Family display" className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  aria-pressed={familyDisplayMode === 'tree'}
                  onClick={() => setFamilyDisplayMode('tree')}
                  className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition sm:px-3 ${
                    familyDisplayMode === 'tree'
                      ? 'bg-white text-[#05224C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Interactive family tree diagram"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Tree</span>
                </button>
                <button
                  type="button"
                  aria-pressed={familyDisplayMode === 'lineage'}
                  onClick={() => setFamilyDisplayMode('lineage')}
                  className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition sm:px-3 ${
                    familyDisplayMode === 'lineage'
                      ? 'bg-white text-[#05224C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Vertical family lineage"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Lineage</span>
                </button>
                <button
                  type="button"
                  aria-pressed={familyDisplayMode === 'list'}
                  onClick={() => setFamilyDisplayMode('list')}
                  className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition sm:px-3 ${
                    familyDisplayMode === 'list'
                      ? 'bg-white text-[#05224C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
              </div>

              <button
                onClick={openInvitations}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-xs"
              >
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>Invitations</span>
                <InvitationBadge pendingCount={pendingCount} showActivity={alertsEnabled && hasUnreadActivity} />
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-semibold transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Relative</span>
              </button>
            </div>
          </div>

          {/* Tree Primary Canvas */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 shadow-xs">
              <div className="w-8 h-8 rounded-full border-2 border-[#05224C] border-t-transparent animate-spin mx-auto"></div>
              <p className="text-xs font-medium text-slate-500">Generating multi-generational family tree...</p>
            </div>
          ) : treeData && familyDisplayMode !== 'list' ? (
            <FamilyTreeCanvas
              tree={treeData}
              layoutStyle={familyDisplayMode === 'lineage' ? 'hierarchy' : 'canvas'}
              density={cardDensity}
              onDensityChange={setCardDensity}
              onSelectNode={(node) => setSelectedNode(node)}
            />
          ) : (
            /* List View or Fallback when in Tree Subview */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Family Members by Generation</h2>
                  <p className="text-xs text-slate-500">
                    Detailed listing of all recorded parents, partner, children, siblings, and relatives.
                  </p>
                </div>
                {treeData && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                    {treeData.summary.totalMembers} Members Total
                  </span>
                )}
              </div>

              {members.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">No family connections recorded yet</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Add parents, your spouse or partner, children, or siblings to generate your visual tree.
                  </p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#05224C] text-white text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Connect First Person</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Grandparents */}
                  {grandparents.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Grandparents
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {grandparents.map((m) => (
                          <MemberCard
                            key={m.relationshipId}
                            member={m}
                            onSelect={() => {
                              const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                              if (matched) setSelectedNode(matched);
                            }}
                            onRemove={(id, name) => setDisconnectTarget({ id, name })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parents */}
                  {parents.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Parents
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {parents.map((m) => (
                          <MemberCard
                            key={m.relationshipId}
                            member={m}
                            onSelect={() => {
                              const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                              if (matched) setSelectedNode(matched);
                            }}
                            onRemove={(id, name) => setDisconnectTarget({ id, name })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* You & Spouses & Siblings */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      You, Partner & Siblings
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {treeData && (
                        <div
                          onClick={() => setSelectedNode(treeData.self)}
                          className="p-4 rounded-xl bg-gradient-to-r from-[#05224C] to-[#083068] text-white flex items-center justify-between cursor-pointer shadow-xs border border-sky-400/40"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-white text-[#05224C] flex items-center justify-center font-bold text-sm">
                              You
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">
                                {treeData.self.firstName} {treeData.self.lastName}
                              </h4>
                              <p className="text-xs text-sky-200">Self (Center Root)</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {spouses.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}

                      {siblings.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Children */}
                  {children.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Children
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {children.map((m) => (
                          <MemberCard
                            key={m.relationshipId}
                            member={m}
                            onSelect={() => {
                              const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                              if (matched) setSelectedNode(matched);
                            }}
                            onRemove={(id, name) => setDisconnectTarget({ id, name })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extended Relatives */}
                  {others.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Extended Relatives
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {others.map((m) => (
                          <MemberCard
                            key={m.relationshipId}
                            member={m}
                            onSelect={() => {
                              const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                              if (matched) setSelectedNode(matched);
                            }}
                            onRemove={(id, name) => setDisconnectTarget({ id, name })}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* SUBVIEW 2: Family Overview */
        <div className="space-y-6">
          {/* Page hero */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#05224C] tracking-tight">
                My Family
              </h1>
              <p className="text-sm text-slate-500">
                Your multi-generational relationships, family roots, and member connections.
              </p>
              <p className="pt-1 text-xs font-medium text-slate-500">
                {connectionsCount} {connectionsCount === 1 ? 'family connection' : 'family connections'} · {generationsCount} {generationsCount === 1 ? 'generation' : 'generations'}
              </p>
            </div>

            {/* Hero actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setSubView('tree')}
                className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                <GitFork className="h-3.5 w-3.5 text-sky-700" />
                <span>View Family Tree</span>
              </button>
              {/* Invitations Hub */}
              <button
                onClick={openInvitations}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-xs"
              >
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>Invitations</span>
                <InvitationBadge pendingCount={pendingCount} showActivity={alertsEnabled && hasUnreadActivity} />
              </button>

              {/* Add Member Button */}
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-semibold transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Relative</span>
              </button>
            </div>
          </div>

          {/* Kinship Discovery Banner */}
          <KinshipDiscoveryBanner idToken={idToken} onClaimed={async () => {
            await loadFamilyData();
            await refreshInvitationNotifications();
          }} />

          {/* Family Connections / Relatives by Generation */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Family Connections</h2>
                <p className="text-xs text-slate-500">
                  Recorded parents, spouse/partner, children, siblings, and extended relatives.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
                <label className="w-full max-w-[22rem] sm:min-w-64">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Family view</span>
                  <select
                    aria-label="Family view"
                    value={familyOverviewView}
                    onChange={(event) => setFamilyOverviewView(event.target.value as FamilyOverviewView)}
                    className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#05224C]"
                  >
                    {familyOverviewViews.map((view) => (
                      <option key={view.id} value={view.id}>{view.label}</option>
                    ))}
                  </select>
                </label>
                <span aria-live="polite" className="self-start rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 sm:self-auto">
                  {familyOverviewView === 'all'
                    ? `${connectionsCount} ${connectionsCount === 1 ? 'Connection' : 'Connections'}`
                    : `${visibleOverviewMembers.length} of ${connectionsCount} connections`}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#05224C] border-t-transparent animate-spin mx-auto"></div>
                <p className="text-xs font-medium text-slate-500">Loading family connections...</p>
              </div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-700">No family connections recorded yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add parents, your spouse or partner, children, or siblings to map your family roots.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#05224C] text-white text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect First Person</span>
                </button>
              </div>
            ) : visibleOverviewMembers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No connections in this view yet</p>
                <p className="mt-1 text-xs text-slate-500">Choose another family view to see your other recorded connections.</p>
              </div>
            ) : familyOverviewView !== 'all' ? (
              <div className="mx-auto w-full max-w-5xl space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-5">
                {familyOverviewHierarchy.map(renderHierarchyTier)}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Grandparents */}
                {grandparents.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Grandparents
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {grandparents.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Parents */}
                {parents.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Parents
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {parents.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* You & Spouses & Siblings */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    You, Partner & Siblings
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* You Card */}
                    {treeData && (
                      <div
                        onClick={() => setSelectedNode(treeData.self)}
                        className="p-4 rounded-xl bg-gradient-to-r from-[#05224C] to-[#083068] text-white flex items-center justify-between cursor-pointer shadow-xs border border-sky-400/40"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-white text-[#05224C] flex items-center justify-center font-bold text-sm">
                            You
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">
                              {treeData.self.firstName} {treeData.self.lastName}
                            </h4>
                            <p className="text-xs text-sky-200">Self (Center Root)</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {spouses.map((m) => (
                      <MemberCard
                        key={m.relationshipId}
                        member={m}
                        onSelect={() => {
                          const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                          if (matched) setSelectedNode(matched);
                        }}
                        onRemove={(id, name) => setDisconnectTarget({ id, name })}
                      />
                    ))}

                    {siblings.map((m) => (
                      <MemberCard
                        key={m.relationshipId}
                        member={m}
                        onSelect={() => {
                          const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                          if (matched) setSelectedNode(matched);
                        }}
                        onRemove={(id, name) => setDisconnectTarget({ id, name })}
                      />
                    ))}
                  </div>
                </div>

                {/* Children */}
                {children.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Children
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {children.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Extended Relatives */}
                {others.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Extended Relatives
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {others.map((m) => (
                        <MemberCard
                          key={m.relationshipId}
                          member={m}
                          onSelect={() => {
                            const matched = treeData?.nodes.find((n) => n.personId === m.personId);
                            if (matched) setSelectedNode(matched);
                          }}
                          onRemove={(id, name) => setDisconnectTarget({ id, name })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Family Member Detail Drawer / Modal */}
      {selectedNode && (
        <FamilyMemberDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          idToken={idToken}
          onUpdated={async () => {
            const nextTree = await loadFamilyData();
            if (nextTree) {
              setSelectedNode((prev) =>
                prev ? nextTree.nodes.find((n) => n.personId === prev.personId) || prev : null,
              );
            }
            await refreshOverview();
            await refreshInvitationNotifications();
          }}
          onRemove={handleRemove}
        />
      )}

      {/* Invitations Hub Modal */}
      <FamilyInvitationsModal
        isOpen={showInvitationsModal || subView === 'invitations'}
        embedded={subView === 'invitations'}
        onOpened={markInvitationActivityRead}
        onClose={() => {
          setShowInvitationsModal(false);
          if (subView === 'invitations') setSubView('overview');
        }}
        idToken={idToken}
        onSuccess={async () => {
          await loadFamilyData();
          await refreshOverview();
          await refreshInvitationNotifications();
        }}
      />

      {/* Add Family Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Add Family Connection</h3>
                <p className="text-xs text-sky-200">Connect a living or deceased relative to your GeoSmart tree</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
                className="text-slate-300 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-700">
                  Relative Status *
                </span>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    aria-pressed={isLiving}
                    onClick={() => setIsLiving(true)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      isLiving
                        ? 'bg-white text-[#05224C] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Living Relative
                  </button>
                  <button
                    type="button"
                    aria-pressed={!isLiving}
                    onClick={() => setIsLiving(false)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      !isLiving
                        ? 'bg-white text-[#05224C] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Deceased (In Memory)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
                    Gender (Optional)
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05224C]"
                  >
                    {familyGenderOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Relationship to You *
                  </label>
                  <select
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                  >
                    {getRelationshipOptions(gender).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 -mt-2">
                Gender only changes relationship wording; it is never inferred from a name.
              </p>

              {!isLiving ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#05224C]">
                      Remembered Relative Details
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Record life dates, family names, geographic roots, and memories for this relative.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Middle / Maiden / Other Names
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={otherNames}
                      onChange={(e) => setOtherNames(e.target.value)}
                      placeholder="Optional middle, maiden, or traditional names"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Birth Year / Date
                      </label>
                      <input
                        type="text"
                        maxLength={32}
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        placeholder="e.g. 1942 or 1942-05-14"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Passing Year / Date
                      </label>
                      <input
                        type="text"
                        maxLength={32}
                        value={deathDate}
                        onChange={(e) => setDeathDate(e.target.value)}
                        placeholder="e.g. 2018 or 2018-11-03"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Origin Town / Village / City
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={originPlaceName}
                        onChange={(e) => setOriginPlaceName(e.target.value)}
                        placeholder="e.g. Enugu or Bristol"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Origin Country
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={originPlaceCountry}
                        onChange={(e) => setOriginPlaceCountry(e.target.value)}
                        placeholder="e.g. Nigeria or United Kingdom"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Life Details & Remembrance Notes
                    </label>
                    <textarea
                      rows={3}
                      maxLength={600}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Life story, family role, resting place, or cherished memories..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none resize-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-800">Living relative privacy</p>
                  <p className="mt-1 text-xs text-slate-600">This creates a basic family placeholder. Invite your relative to claim it; they can add personal details and roots themselves after joining.</p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-semibold transition disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Add Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal for Disconnecting */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-slate-900 text-base">Disconnect Family Member?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to disconnect <span className="font-semibold text-slate-800">{disconnectTarget.name}</span> from your family tree? This will remove their node and relationship link.
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
                  } catch {
                    // Handled in executeRemove
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

const InvitationBadge: React.FC<{ pendingCount: number; showActivity: boolean }> = ({ pendingCount, showActivity }) => (
  <span className="inline-flex items-center gap-1.5">
    {showActivity && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />}
    {pendingCount > 0 && (
      <span aria-label={`${pendingCount} pending invitations`} className="min-w-5 rounded-full bg-sky-100 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-sky-900">
        {pendingCount > 99 ? '99+' : pendingCount}
      </span>
    )}
    {(showActivity || pendingCount > 0) && (
      <span className="sr-only">
        {showActivity ? 'New invitation activity. ' : ''}
        {pendingCount > 0 ? `${pendingCount} pending invitations.` : ''}
      </span>
    )}
  </span>
);

const MemberCard: React.FC<{
  member: FamilyMemberWithPerson;
  onSelect: () => void;
  onRemove: (id: number, name: string) => void;
}> = ({ member, onSelect, onRemove }) => {
  const firstName = member.firstName || (member as any).relative?.firstName || 'Family';
  const lastName = member.lastName || (member as any).relative?.lastName || 'Member';
  const fullName = `${firstName} ${lastName}`.trim();
  const visibility = (member as any).visibility || 'private';

  return (
    <div
      onClick={onSelect}
      className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between hover:border-slate-300 cursor-pointer transition group"
    >
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-slate-100 text-[#05224C] flex items-center justify-center font-bold text-sm flex-shrink-0">
          {firstName.charAt(0)}
          {lastName.charAt(0)}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-[#05224C]">
            {fullName}
          </h4>
          <div className="flex items-center space-x-2 text-xs text-slate-500 capitalize truncate">
            <span className="font-semibold text-slate-700">{getRelationshipLabel(member.relationshipType, member.gender)}</span>
            <span>·</span>
            {member.hasAccount ? (
              <span className="text-emerald-700 font-medium">Member</span>
            ) : !member.isLiving ? (
              <span className="text-slate-600 font-medium">
                {member.birthDate || member.deathDate
                  ? `In Memory (${[member.birthDate, member.deathDate].filter(Boolean).join(' – ')})`
                  : 'In Memory'}
              </span>
            ) : (
              <span className="text-amber-700">Unlinked</span>
            )}
            {member.placeOfOrigin && (member.placeOfOrigin.name || member.placeOfOrigin.country) && (
              <>
                <span>·</span>
                <span className="truncate">
                  {[member.placeOfOrigin.name, member.placeOfOrigin.country].filter(Boolean).join(', ')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-1 pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(member.relationshipId, fullName);
          }}
          title="Disconnect connection"
          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
