import React from 'react';
import { User, CheckCircle, Mail, MapPin, Lock, Eye, Users } from 'lucide-react';
import type { FamilyTreeNode } from '../types.ts';
import { getRelationshipLabel } from '../lib/family-relationships.ts';

export interface FamilyTreeNodeCardProps {
  node: FamilyTreeNode;
  onClick: (node: FamilyTreeNode) => void;
  isFocused?: boolean;
  density?: 'compact' | 'comfortable';
  className?: string;
}

export const FamilyTreeNodeCard: React.FC<FamilyTreeNodeCardProps> = ({
  node,
  onClick,
  isFocused = false,
  density = 'comfortable',
  className = '',
}) => {
  const isSelf = Boolean(node.isSelf);
  const initials = `${node.firstName?.charAt(0) || ''}${node.lastName?.charAt(0) || ''}`.toUpperCase();
  const isCompact = density === 'compact';

  // Base sizing depending on density mode
  const widthClass = className || (isCompact ? 'w-40 sm:w-48' : 'w-52 sm:w-60');

  return (
    <div
      onClick={() => onClick(node)}
      id={`family-node-${node.personId}`}
      role="button"
      tabIndex={0}
      className={`relative group cursor-pointer transition-all duration-200 text-left rounded-xl border select-none ${widthClass} ${
        isCompact ? 'p-2.5 sm:p-3' : 'p-3.5 sm:p-4'
      } ${
        isSelf
          ? 'bg-gradient-to-b from-[#05224C] to-[#083068] text-white border-sky-400 shadow-md ring-2 ring-sky-400/40'
          : isFocused
          ? 'bg-sky-50/90 border-sky-500 shadow-sm ring-2 ring-sky-300'
          : 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 shadow-xs'
      }`}
    >
      {/* Top Meta Row */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span
          className={`font-bold uppercase tracking-wider rounded-md truncate max-w-[120px] ${
            isCompact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
          } ${
            isSelf
              ? 'bg-sky-400/20 text-sky-200 border border-sky-300/30'
              : 'bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          {isSelf ? 'You (Self)' : getRelationshipLabel(node.relationshipType, node.gender)}
        </span>

        {/* Verification & Visibility */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          {node.hasAccount ? (
            <span
              title="Verified GeoSmart Member"
              className={`flex items-center space-x-1 font-medium rounded ${
                isCompact ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
              } ${
                isSelf
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden sm:inline">Member</span>
            </span>
          ) : (
            <span
              title="Family profile (Unclaimed account)"
              className={`font-medium rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1 ${
                isCompact ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span className="hidden sm:inline">Unlinked</span>
            </span>
          )}

          {!isCompact && (
            <div
              title={`Visibility: ${node.visibility}`}
              className={`p-0.5 rounded ${isSelf ? 'text-slate-300' : 'text-slate-400'}`}
            >
              {node.visibility === 'public' ? (
                <Eye className="w-3 h-3" />
              ) : node.visibility === 'shared' ? (
                <Users className="w-3 h-3" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Avatar & Name */}
      <div className="flex items-center space-x-2.5">
        <div
          className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 relative ${
            isCompact ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs'
          } ${
            isSelf
              ? 'bg-white text-[#05224C] shadow-inner font-extrabold'
              : 'bg-slate-100 text-[#05224C] border border-slate-200'
          }`}
        >
          {initials || <User className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />}
          {node.hasAccount && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 border-2 border-white rounded-full"
              title="Active account"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4
            className={`font-semibold truncate ${isCompact ? 'text-xs leading-tight' : 'text-sm'} ${
              isSelf ? 'text-white' : 'text-slate-900 group-hover:text-[#05224C]'
            }`}
          >
            {node.firstName} {node.lastName}
          </h4>

          {node.otherNames && !isCompact && (
            <p className={`text-[11px] truncate ${isSelf ? 'text-slate-300' : 'text-slate-500'}`}>
              ({node.otherNames})
            </p>
          )}

          {/* Place of Origin / Roots */}
          {node.placeOfOrigin ? (
            <p
              className={`flex items-center space-x-1 mt-0.5 truncate ${
                isCompact ? 'text-[10px]' : 'text-[11px]'
              } ${isSelf ? 'text-sky-200' : 'text-slate-500'}`}
            >
              <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-sky-500" />
              <span className="truncate">{node.placeOfOrigin}</span>
            </p>
          ) : !isCompact ? (
            <p className={`text-[10px] mt-0.5 ${isSelf ? 'text-slate-300' : 'text-slate-400'}`}>
              {node.notes || 'Tap for details'}
            </p>
          ) : null}
        </div>
      </div>

      {/* Footer prompt if not claimed */}
      {!isSelf && !node.hasAccount && !isCompact && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-sky-700 font-medium group-hover:text-sky-800">
          <span className="flex items-center space-x-1">
            <Mail className="w-2.5 h-2.5" />
            <span>Invite / Link account</span>
          </span>
          <span>→</span>
        </div>
      )}
    </div>
  );
};
