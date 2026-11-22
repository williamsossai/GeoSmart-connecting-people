import React, { useState } from 'react';
import {
  Users,
  CheckCircle,
  MapPin,
  Heart,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react';
import { FamilyTreeNodeCard } from './FamilyTreeNodeCard.tsx';
import { getRelationshipLabel } from '../lib/family-relationships.ts';
import type { FamilyTreeGraph, FamilyTreeNode } from '../types.ts';

interface FamilyLineageHierarchyProps {
  tree: FamilyTreeGraph;
  onSelectNode: (node: FamilyTreeNode) => void;
}

export const FamilyLineageHierarchy: React.FC<FamilyLineageHierarchyProps> = ({
  tree,
  onSelectNode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({
    grandparents: true,
    parents: true,
    immediate: true,
    siblings: true,
    children: true,
    grandchildren: true,
    extended: true,
  });

  const toggleTier = (key: string) => {
    setExpandedTiers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Group nodes into generational tiers
  const grandparents = tree.nodes.filter((n) => n.generation === 2);
  const parents = tree.nodes.filter((n) => n.generation === 1);
  const selfNode = tree.self;
  const spouses = tree.nodes.filter((n) => n.relationshipType === 'spouse' && !n.isSelf);
  const siblings = tree.nodes.filter((n) => n.relationshipType === 'sibling');
  const children = tree.nodes.filter((n) => n.generation === -1);
  const grandchildren = tree.nodes.filter((n) => n.generation === -2);
  const extended = tree.nodes.filter((n) => n.generation === 3);

  const matchesSearch = (node: FamilyTreeNode) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${node.firstName} ${node.lastName} ${node.otherNames || ''}`.toLowerCase();
    const rel = getRelationshipLabel(node.relationshipType, node.gender).toLowerCase();
    const origin = (node.placeOfOrigin || '').toLowerCase();
    return name.includes(q) || rel.includes(q) || origin.includes(q);
  };

  return (
    <div className="space-y-6">
      {/* Header bar with summary & search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <GitBranch className="w-4 h-4 text-[#05224C]" />
          <span className="font-semibold text-slate-800">Generational Lineage Cascade</span>
          <span className="text-slate-400">·</span>
          <span>{tree.summary.totalMembers} members mapped across {tree.summary.generationsCount} generations</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter lineage..."
              aria-label="Filter lineage"
              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] min-h-10"
            />
          </div>
        </div>
      </div>

      {/* Vertical Generational Hierarchy Timeline */}
      <div className="relative pl-4 sm:pl-6 border-l-2 border-slate-200 space-y-8 ml-2 sm:ml-4">
        {/* TIER +2: GRANDPARENTS */}
        {grandparents.length > 0 && (
          <div className="relative space-y-3">
            {/* Timeline Anchor Dot */}
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
            </div>

            <button
              onClick={() => toggleTier('grandparents')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.grandparents ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Generation +2 · Grandparents & Ancestors
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {grandparents.length}
              </span>
            </button>

            {expandedTiers.grandparents && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {grandparents.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIER +1: PARENTS */}
        {parents.length > 0 && (
          <div className="relative space-y-3">
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-sky-300 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-700"></div>
            </div>

            <button
              onClick={() => toggleTier('parents')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.parents ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-sky-900 uppercase tracking-wider">
                Generation +1 · Parents
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                {parents.length}
              </span>
            </button>

            {expandedTiers.parents && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {parents.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIER 0: YOU & SPOUSE / PARTNER (THE ROOT ANCHOR) */}
        <div className="relative space-y-3">
          <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-[#05224C] border-2 border-white flex items-center justify-center ring-2 ring-sky-200">
            <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-extrabold text-[#05224C] uppercase tracking-wider">
              Generation 0 · You & Immediate Household
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#05224C] text-white">
              Primary Anchor
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {matchesSearch(selfNode) && (
              <FamilyTreeNodeCard
                node={selfNode}
                onClick={onSelectNode}
                isFocused
                className="w-full"
              />
            )}

            {spouses.filter(matchesSearch).map((node) => (
              <FamilyTreeNodeCard
                key={node.personId}
                node={node}
                onClick={onSelectNode}
                className="w-full"
              />
            ))}
          </div>
        </div>

        {/* TIER 0 (B): SIBLINGS */}
        {siblings.length > 0 && (
          <div className="relative space-y-3">
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-indigo-300 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-700"></div>
            </div>

            <button
              onClick={() => toggleTier('siblings')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.siblings ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                Generation 0 · Siblings
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {siblings.length}
              </span>
            </button>

            {expandedTiers.siblings && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {siblings.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIER -1: CHILDREN */}
        {children.length > 0 && (
          <div className="relative space-y-3">
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-800"></div>
            </div>

            <button
              onClick={() => toggleTier('children')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.children ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                Generation -1 · Children
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {children.length}
              </span>
            </button>

            {expandedTiers.children && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {children.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIER -2: GRANDCHILDREN */}
        {grandchildren.length > 0 && (
          <div className="relative space-y-3">
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-teal-400 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-800"></div>
            </div>

            <button
              onClick={() => toggleTier('grandchildren')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.grandchildren ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-teal-900 uppercase tracking-wider">
                Generation -2 · Grandchildren
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                {grandchildren.length}
              </span>
            </button>

            {expandedTiers.grandchildren && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {grandchildren.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* EXTENDED FAMILY */}
        {extended.length > 0 && (
          <div className="relative space-y-3">
            <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-4 h-4 rounded-full bg-purple-300 border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-700"></div>
            </div>

            <button
              onClick={() => toggleTier('extended')}
              className="flex items-center space-x-2 text-left group"
            >
              {expandedTiers.extended ? (
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              )}
              <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                Extended Family & Kinship
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {extended.length}
              </span>
            </button>

            {expandedTiers.extended && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {extended.filter(matchesSearch).map((node) => (
                  <FamilyTreeNodeCard
                    key={node.personId}
                    node={node}
                    onClick={onSelectNode}
                    className="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
