import React from 'react';
import { useAuth } from './AuthContext.tsx';
import { User, Users, Compass, MapPin, ArrowRight, Shield } from 'lucide-react';

interface HomeOverviewProps {
  onNavigate: (tab: 'profile' | 'family' | 'community' | 'place') => void;
}

export const HomeOverview: React.FC<HomeOverviewProps> = ({ onNavigate }) => {
  const { userOverview } = useAuth();

  const stats = userOverview?.stats || {
    countriesCount: 0,
    placesCount: 0,
    communitiesCount: 0,
    familyCount: 0,
  };

  const displayName = userOverview?.person?.firstName
    ? `${userOverview.person.firstName} ${userOverview.person.lastName || ''}`.trim()
    : userOverview?.user?.displayName || 'Friend';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Header section */}
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#05224C]">
          Welcome, {displayName}
        </h1>
        <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
          Here is the living picture of who you are, the people you are connected to, the communities you
          belong to, and the places that shape your journey.
        </p>

        {/* Small Summary Badge */}
        <div className="pt-2">
          <div className="inline-flex flex-wrap items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-xs">
            <span className="font-bold text-[#05224C]">{stats.countriesCount}</span>{' '}
            {stats.countriesCount === 1 ? 'country' : 'countries'}
            <span className="text-slate-300">·</span>
            <span className="font-bold text-[#05224C]">{stats.placesCount}</span>{' '}
            {stats.placesCount === 1 ? 'place' : 'places'}
            <span className="text-slate-300">·</span>
            <span className="font-bold text-[#05224C]">{stats.communitiesCount}</span>{' '}
            {stats.communitiesCount === 1 ? 'community' : 'communities'}
            <span className="text-slate-300">·</span>
            <span className="font-bold text-[#05224C]">{stats.familyCount}</span>{' '}
            {stats.familyCount === 1 ? 'family connection' : 'family connections'}
          </div>
        </div>
      </div>

      {/* Four Primary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* 1. My Profile */}
        <button
          onClick={() => onNavigate('profile')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 hover:border-[#05224C]/30 hover:shadow-md transition duration-200 relative overflow-hidden flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#05224C] flex items-center justify-center group-hover:bg-[#05224C] group-hover:text-white transition duration-200">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-[#05224C] transition">
                My Profile
              </h2>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Who am I?</p>
              <p className="text-xs text-slate-600 mt-2.5 leading-relaxed line-clamp-2">
                {userOverview?.profile.bio ||
                  'Your foundational identity, biographical context, and personal privacy controls.'}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#05224C]">
            <span>View & manage profile</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition duration-200" />
          </div>
        </button>

        {/* 2. My Family */}
        <button
          onClick={() => onNavigate('family')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 hover:border-[#05224C]/30 hover:shadow-md transition duration-200 relative overflow-hidden flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#05224C] flex items-center justify-center group-hover:bg-[#05224C] group-hover:text-white transition duration-200">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-[#05224C] transition">
                My Family
              </h2>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Who am I connected to?</p>
              <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                {stats.familyCount > 0
                  ? `${stats.familyCount} active connections across your multi-generational family tree.`
                  : 'Explore your family overview, invite relatives, and view your family tree.'}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#05224C]">
            <span>View family overview & tree</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition duration-200" />
          </div>
        </button>

        {/* 3. My Community */}
        <button
          onClick={() => onNavigate('community')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 hover:border-[#05224C]/30 hover:shadow-md transition duration-200 relative overflow-hidden flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#05224C] flex items-center justify-center group-hover:bg-[#05224C] group-hover:text-white transition duration-200">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-[#05224C] transition">
                My Community
              </h2>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Where do I belong?</p>
              <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                {stats.communitiesCount > 0
                  ? `${stats.communitiesCount} connected communities, hometown associations, or diaspora chapters.`
                  : 'Connect with your hometown community, diaspora group, or cultural association.'}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#05224C]">
            <span>View communities</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition duration-200" />
          </div>
        </button>

        {/* 4. My Place */}
        <button
          onClick={() => onNavigate('place')}
          className="group text-left p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 hover:border-[#05224C]/30 hover:shadow-md transition duration-200 relative overflow-hidden flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#05224C] flex items-center justify-center group-hover:bg-[#05224C] group-hover:text-white transition duration-200">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-[#05224C] transition">
                My Place
              </h2>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                What places connect to my story?
              </p>
              <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                {stats.placesCount > 0
                  ? `${stats.placesCount} geographic places mapped: where you live, where you are from, and ancestral roots.`
                  : 'Document where you live, where you are from, and your ancestral or work locations.'}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#05224C]">
            <span>View connected places</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition duration-200" />
          </div>
        </button>
      </div>

      {/* Trust & Privacy Note */}
      <div className="p-4 rounded-xl bg-slate-100/70 border border-slate-200/80 flex items-center space-x-3 text-xs text-slate-600">
        <Shield className="w-4 h-4 text-emerald-700 flex-shrink-0" />
        <span>
          <strong>Privacy By Design:</strong> Your relationships and personal records remain under your
          sole control. You can export a full copy of your data or delete your account at any time in My Profile.
        </span>
      </div>
    </div>
  );
};
