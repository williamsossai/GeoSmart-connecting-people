import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
  Users,
  Layers,
  CheckCircle,
  MapPin,
  Search,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react';
import { FamilyTreeNodeCard } from './FamilyTreeNodeCard.tsx';
import { getRelationshipLabel } from '../lib/family-relationships.ts';
import { FamilyLineageHierarchy } from './FamilyLineageHierarchy.tsx';
import type { FamilyTreeGraph, FamilyTreeNode } from '../types.ts';

interface FamilyTreeCanvasProps {
  tree: FamilyTreeGraph;
  onSelectNode: (node: FamilyTreeNode) => void;
  layoutStyle: 'canvas' | 'hierarchy';
  density: 'compact' | 'comfortable';
  onDensityChange: (density: 'compact' | 'comfortable') => void;
}

export const FamilyTreeCanvas: React.FC<FamilyTreeCanvasProps> = ({
  tree,
  onSelectNode,
  layoutStyle,
  density,
  onDensityChange,
}) => {
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(Math.round((z + 0.15) * 100) / 100, 1.8));
  const handleZoomOut = () => setZoom((z) => Math.max(Math.round((z - 0.15) * 100) / 100, 0.45));
  const handleResetZoom = () => setZoom(1);

  // Auto-fit to screen: calculates zoom level to fit tree within viewport width without horizontal overflow
  const handleFitToScreen = useCallback(() => {
    if (!canvasRef.current || !contentRef.current) return;
    const containerWidth = canvasRef.current.clientWidth;
    const contentWidth = contentRef.current.scrollWidth;

    if (containerWidth > 0 && contentWidth > 0) {
      // Leave generous 40px margin
      const available = containerWidth - 40;
      const fitRatio = available / contentWidth;
      // Clamp between 0.45 and 1.05
      const newZoom = Math.min(1.0, Math.max(0.45, Math.round(fitRatio * 100) / 100));
      setZoom(newZoom);
    }
  }, []);

  // On mount and tree updates, fit the diagram to the available width.
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 150);

    return () => clearTimeout(timer);
  }, [tree, handleFitToScreen]);

  const handleCenterOnMe = () => {
    const el = document.getElementById(`family-node-${tree.self.personId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  };

  // Group nodes into generational bands
  const grandparents = tree.nodes.filter((n) => n.generation === 2);
  const parents = tree.nodes.filter((n) => n.generation === 1);
  const selfNode = tree.self;
  const spouses = tree.nodes.filter((n) => n.relationshipType === 'spouse' && !n.isSelf);
  const siblings = tree.nodes.filter((n) => n.relationshipType === 'sibling');
  const children = tree.nodes.filter((n) => n.generation === -1);
  const grandchildren = tree.nodes.filter((n) => n.generation === -2);
  const extended = tree.nodes.filter((n) => n.generation === 3);

  // Filtered by search if any
  const matchesSearch = (node: FamilyTreeNode) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${node.firstName} ${node.lastName} ${node.otherNames || ''}`.toLowerCase();
    const rel = getRelationshipLabel(node.relationshipType, node.gender).toLowerCase();
    const origin = (node.placeOfOrigin || '').toLowerCase();
    return name.includes(q) || rel.includes(q) || origin.includes(q);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* Top Toolbar & Controls */}
      <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Family tree summary */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Metrics */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-medium text-slate-700 text-xs">
            <Users className="w-3.5 h-3.5 text-[#05224C]" />
            <span>{tree.summary.totalMembers} Members</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-medium text-slate-700 text-xs">
            <Layers className="w-3.5 h-3.5 text-sky-600" />
            <span>{tree.summary.generationsCount} Generations</span>
          </div>

          {tree.summary.placesCount > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-medium text-slate-700 text-xs">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>{tree.summary.placesCount} Origins</span>
            </div>
          )}
        </div>

        {/* Search and tree display controls */}
        <div className="flex items-center flex-wrap gap-2">
          {layoutStyle === 'canvas' && <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search relatives..."
              aria-label="Search relatives"
              className="pl-8 pr-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] bg-white w-36 sm:w-40 lg:w-48 min-h-10"
            />
          </div>

              <button
                type="button"
                onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
                aria-label={`Card size: ${density}. Switch to ${density === 'compact' ? 'comfortable' : 'compact'}.`}
                title={`Switch to ${density === 'compact' ? 'Comfortable' : 'Compact'} cards`}
                aria-pressed={density === 'comfortable'}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#05224C]"
              >
                <SlidersHorizontal aria-hidden="true" className="w-4 h-4 text-slate-500" />
                <span className="capitalize">{density}</span>
              </button>

              {/* Fit to Screen (1-click auto-scaler) */}
              <button
                type="button"
                onClick={handleFitToScreen}
                title="Fit Tree to Viewport"
                aria-label="Fit tree to viewport"
                className="min-h-10 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1 transition shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#05224C]"
              >
                <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Fit</span>
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom out"
                  aria-label="Zoom out"
                  className="min-h-10 min-w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#05224C]"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-mono font-medium text-slate-600 min-w-[36px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom in"
                  aria-label="Zoom in"
                  className="min-h-10 min-w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#05224C]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset to 100%"
                  aria-label="Reset zoom to 100 percent"
                  className="min-h-10 min-w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 border-l border-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#05224C]"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Center on Me */}
              <button
                type="button"
                onClick={handleCenterOnMe}
                title="Center Tree on You"
                aria-label="Center tree on you"
                className="min-h-10 px-3 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-xs font-medium flex items-center gap-1.5 transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#05224C]"
              >
                <Compass className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Center</span>
              </button>
          </>}
        </div>
      </div>

      {/* Main Content Area */}
      {layoutStyle === 'hierarchy' ? (
        <div className="p-4 sm:p-6 bg-white overflow-auto max-h-[75vh]">
          <FamilyLineageHierarchy
            tree={tree}
            onSelectNode={onSelectNode}
          />
        </div>
      ) : (
        /* Interactive Diagram Canvas */
        <div
          ref={canvasRef}
          className="relative overflow-auto p-4 sm:p-8 min-h-[520px] max-h-[75vh] bg-gradient-to-b from-slate-50/80 via-white to-slate-50/50"
        >
          {/* Visual Canvas Inner Container */}
          <div
            ref={contentRef}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="flex flex-col items-center space-y-6 sm:space-y-8 py-4 mx-auto w-fit min-w-[280px] max-w-full"
          >
            {/* TIER +2: GRANDPARENTS */}
            {grandparents.length > 0 && (
              <div className="flex flex-col items-center space-y-2.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-200/80 border border-slate-300/60">
                  Generation +2 · Grandparents & Ancestors
                </div>
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap max-w-3xl">
                  {grandparents.filter(matchesSearch).map((node) => (
                    <FamilyTreeNodeCard
                      key={node.personId}
                      node={node}
                      onClick={onSelectNode}
                      density={density}
                    />
                  ))}
                </div>

                {/* Pedigree Branch Drop */}
                <div className="flex flex-col items-center pt-1">
                  <div className="w-0.5 h-5 bg-slate-300"></div>
                  <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                </div>
              </div>
            )}

            {/* TIER +1: PARENTS */}
            {parents.length > 0 && (
              <div className="flex flex-col items-center space-y-2.5">
                <div className="text-[10px] font-bold text-sky-800 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-100 border border-sky-200">
                  Generation +1 · Parents
                </div>
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap max-w-2xl">
                  {parents.filter(matchesSearch).map((node) => (
                    <FamilyTreeNodeCard
                      key={node.personId}
                      node={node}
                      onClick={onSelectNode}
                      density={density}
                    />
                  ))}
                </div>

                {/* Pedigree Branch Drop down to Generation 0 */}
                <div className="flex flex-col items-center pt-1">
                  <div className="w-0.5 h-6 bg-slate-300"></div>
                  <div className="w-2 h-2 rounded-full bg-sky-600"></div>
                </div>
              </div>
            )}

            {/* TIER 0: YOU (SELF) + SPOUSE/PARTNER + SIBLINGS */}
            <div className="flex flex-col items-center space-y-4">
              <div className="text-[10px] font-extrabold text-[#05224C] uppercase tracking-wider px-3 py-0.5 rounded-full bg-sky-100 border border-sky-200 flex items-center space-x-1.5 shadow-2xs">
                <span>Generation 0 · You & Immediate Family</span>
              </div>

              {/* Central Couple Anchor: You + Spouse/Partner */}
              <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
                {matchesSearch(selfNode) && (
                  <FamilyTreeNodeCard
                    node={selfNode}
                    onClick={onSelectNode}
                    isFocused
                    density={density}
                  />
                )}

                {spouses.length > 0 && (
                  <>
                    <div className="flex items-center px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                      Partner
                    </div>
                    {spouses.filter(matchesSearch).map((node) => (
                      <FamilyTreeNodeCard
                        key={node.personId}
                        node={node}
                        onClick={onSelectNode}
                        density={density}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Siblings Pod: Grouped neatly with wrap-friendly constraint */}
              {siblings.length > 0 && (
                <div className="flex flex-col items-center space-y-2 pt-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Siblings ({siblings.length})
                  </span>
                  <div className="flex items-center justify-center gap-2.5 sm:gap-3 flex-wrap max-w-2xl">
                    {siblings.filter(matchesSearch).map((node) => (
                      <FamilyTreeNodeCard
                        key={node.personId}
                        node={node}
                        onClick={onSelectNode}
                        density={density}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* TIER -1: CHILDREN */}
            {children.length > 0 && (
              <div className="flex flex-col items-center space-y-2.5">
                {/* Branch connector from Generation 0 */}
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-6 bg-slate-300"></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                </div>

                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">
                  Generation -1 · Children & Descendants
                </div>
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap max-w-3xl">
                  {children.filter(matchesSearch).map((node) => (
                    <FamilyTreeNodeCard
                      key={node.personId}
                      node={node}
                      onClick={onSelectNode}
                      density={density}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TIER -2: GRANDCHILDREN */}
            {grandchildren.length > 0 && (
              <div className="flex flex-col items-center space-y-2.5">
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-5 bg-slate-300"></div>
                  <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                </div>

                <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-100 border border-teal-200">
                  Generation -2 · Grandchildren
                </div>
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap max-w-3xl">
                  {grandchildren.filter(matchesSearch).map((node) => (
                    <FamilyTreeNodeCard
                      key={node.personId}
                      node={node}
                      onClick={onSelectNode}
                      density={density}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* EXTENDED RELATIVES (Aunts, Uncles, Cousins) */}
            {extended.length > 0 && (
              <div className="flex flex-col items-center space-y-2.5 pt-4 border-t border-slate-200/80 w-full">
                <div className="text-[10px] font-bold text-purple-800 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 border border-purple-200">
                  Extended Kinship & Relatives
                </div>
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap max-w-4xl">
                  {extended.filter(matchesSearch).map((node) => (
                    <FamilyTreeNodeCard
                      key={node.personId}
                      node={node}
                      onClick={onSelectNode}
                      density={density}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
