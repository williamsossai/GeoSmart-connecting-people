import React, { useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  ShieldCheck,
  MapPin,
  Users,
  Compass,
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
  Sparkles,
} from 'lucide-react';
import type { RelationshipType } from '../types.ts';
import { familyGenderOptions, getRelationshipOptions } from '../lib/family-relationships.ts';
import { ProfileLocationSelector, type ProfileLocationSelection } from './ProfileLocationSelector.tsx';

interface OnboardingModalProps {
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const { idToken, userOverview, refreshOverview } = useAuth();
  const [currentStep, setCurrentStep] = useState(2); // Step 1 was account creation
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form states
  // Step 3: Tell us about yourself
  const [firstName, setFirstName] = useState(userOverview?.person?.firstName || '');
  const [lastName, setLastName] = useState(userOverview?.person?.lastName || '');
  const [bio, setBio] = useState('');

  // Step 4: Where do you live?
  const [liveLocationSummary, setLiveLocationSummary] = useState('');
  const [liveLocation, setLiveLocation] = useState<ProfileLocationSelection | null>(null);

  // Step 5: Where are you from?
  const [originLocationSummary, setOriginLocationSummary] = useState('');
  const [originLocation, setOriginLocation] = useState<ProfileLocationSelection | null>(null);

  // Step 6: Family/ancestral place
  const [ancestralPlace, setAncestralPlace] = useState('');
  const [ancestralCountry, setAncestralCountry] = useState('');

  // Step 7: Add family member
  const [famFirstName, setFamFirstName] = useState('');
  const [famLastName, setFamLastName] = useState('');
  const [famGender, setFamGender] = useState('unspecified');
  const [famRelation, setFamRelation] = useState<RelationshipType>('parent');

  // Step 8: Community
  const [commName, setCommName] = useState('');
  const [commType, setCommType] = useState('hometown');

  // Step 9: Other place
  const [otherPlace, setOtherPlace] = useState('');
  const [otherCountry, setOtherCountry] = useState('');

  const nextStep = () => {
    if (currentStep < 9) {
      setCurrentStep(currentStep + 1);
    } else {
      finishOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStep > 2) {
      setCurrentStep(currentStep - 1);
    }
  };

  const finishOnboarding = async () => {
    if (!idToken) return;
    setSaving(true);
    setSaveError(null);
    const save = async (url: string, method: 'POST' | 'PATCH', body?: unknown) => {
      const res = await fetch(url, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${idToken}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not save onboarding information (${res.status}).`);
      }
    };
    try {
      // 1. Save profile and the selected origin/residence summaries.
      const profileUpdate: Record<string, string> = {};
      if (firstName || lastName || bio) {
        profileUpdate.firstName = firstName;
        profileUpdate.lastName = lastName;
        profileUpdate.bio = bio;
      }
      if (liveLocation) profileUpdate.currentResidenceSummary = liveLocation.summary;
      if (originLocation) profileUpdate.originSummary = originLocation.summary;
      if (Object.keys(profileUpdate).length > 0) await save('/api/user/profile', 'PATCH', profileUpdate);

      // 2. Save where I live (Step 4)
      if (liveLocation) {
        await save('/api/places', 'POST', {
          name: liveLocation.name,
          country: liveLocation.country,
          stateRegion: liveLocation.stateRegion,
          townCity: liveLocation.townCity,
          placeType: liveLocation.townCity ? 'town' : liveLocation.stateRegion ? 'region' : 'country',
          connectionType: 'residence',
          humanLabel: 'Where I live',
          isCurrent: true,
        });
      }

      // 3. Save where I'm from (Step 5)
      if (originLocation) {
        await save('/api/places', 'POST', {
          name: originLocation.name,
          country: originLocation.country,
          stateRegion: originLocation.stateRegion,
          townCity: originLocation.townCity,
          placeType: originLocation.townCity ? 'town' : originLocation.stateRegion ? 'region' : 'country',
          connectionType: 'origin',
          humanLabel: "Where I'm from",
        });
      }

      // 4. Save family/ancestral place (Step 6)
      if (ancestralPlace.trim() && ancestralCountry.trim()) {
        await save('/api/places', 'POST', {
            name: ancestralPlace.trim(),
            country: ancestralCountry.trim(),
            connectionType: 'family_ancestral',
            humanLabel: 'Family/ancestral place',
        });
      }

      // 5. Save family member (Step 7)
      if (famFirstName.trim() && famLastName.trim()) {
        await save('/api/family', 'POST', {
            firstName: famFirstName.trim(),
            lastName: famLastName.trim(),
            gender: famGender === 'unspecified' ? undefined : famGender,
            relationshipType: famRelation,
        });
      }

      // 6. Save community (Step 8)
      if (commName.trim()) {
        await save('/api/communities', 'POST', {
            name: commName.trim(),
            communityType: commType,
            connectionType: 'member',
        });
      }

      // 7. Save other place (Step 9)
      if (otherPlace.trim() && otherCountry.trim()) {
        await save('/api/places', 'POST', {
            name: otherPlace.trim(),
            country: otherCountry.trim(),
            connectionType: 'other',
            humanLabel: 'Connected place',
        });
      }

      // Mark onboarding complete on backend
      await save('/api/user/onboarding', 'POST');

      await refreshOverview();
      onComplete();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setSaveError(err instanceof Error ? err.message : 'Could not save your onboarding details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Progress header */}
        <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">
              Step {currentStep} of 9
            </span>
          </div>
          <div className="flex space-x-1">
            {[2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
              <div
                key={s}
                className={`w-4 h-1.5 rounded-full transition-all duration-300 ${
                  s === currentStep
                    ? 'bg-sky-400 w-6'
                    : s < currentStep
                    ? 'bg-white/60'
                    : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
          {saveError && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError} Your saved details are kept; retry to finish.
            </div>
          )}
          {/* Step 2: Welcome */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-[#05224C] flex items-center justify-center border border-sky-100">
                <Sparkles className="w-6 h-6 text-sky-700" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Welcome to GeoSmart
                </h2>
                <p className="mt-3 text-slate-600 leading-relaxed text-base">
                  GeoSmart helps you build a simple picture of who you are, the people you're
                  connected to, the communities that matter to you, and the places that connect your
                  story.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    You stay in control of your personal information.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Your records are private to you by default. Nothing is shared without your explicit choice.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Tell us about yourself */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Tell us about yourself
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  The beginning of your profile record.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Brief Bio / Story (Optional)
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A sentence or two about who you are..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 4: Where do you live? */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 text-[#05224C] flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-sky-700" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Where do you live?
                  </h2>
                  <p className="text-sm text-slate-500">Your current place of residence.</p>
                </div>
              </div>

              <ProfileLocationSelector
                label="Residence"
                value={liveLocationSummary}
                onChange={setLiveLocationSummary}
                onSelectionChange={setLiveLocation}
              />
            </div>
          )}

          {/* Step 5: Where are you from? */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 text-[#05224C] flex items-center justify-center">
                  <Globe className="w-5 h-5 text-sky-700" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Where are you from?
                  </h2>
                  <p className="text-sm text-slate-500">Your place of personal origin or roots.</p>
                </div>
              </div>

              <ProfileLocationSelector
                label="Personal origin"
                value={originLocationSummary}
                onChange={setOriginLocationSummary}
                onSelectionChange={setOriginLocation}
              />
            </div>
          )}

          {/* Step 6: Family/ancestral place */}
          {currentStep === 6 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                  Optional
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  Is there a place your family is connected to?
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  An ancestral village, hometown, or family region.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Place Name / Village / Locality
                  </label>
                  <input
                    type="text"
                    value={ancestralPlace}
                    onChange={(e) => setAncestralPlace(e.target.value)}
                    placeholder="e.g. Ngwo Village, Delta State"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={ancestralCountry}
                    onChange={(e) => setAncestralCountry(e.target.value)}
                    placeholder="e.g. Nigeria"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Add someone from family */}
          {currentStep === 7 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                  Optional
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  Would you like to add someone from your family?
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  A parent, child, spouse, sibling, or other relative.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Their First Name
                  </label>
                  <input
                    type="text"
                    value={famFirstName}
                    onChange={(e) => setFamFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Their Last Name
                  </label>
                  <input
                    type="text"
                    value={famLastName}
                    onChange={(e) => setFamLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">Their gender (Optional)</label>
                <select
                  value={famGender}
                  onChange={(e) => setFamGender(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05224C]"
                >
                  {familyGenderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  How are you connected?
                </label>
                <select
                  value={famRelation}
                  onChange={(e) => setFamRelation(e.target.value as RelationshipType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                >
                  {getRelationshipOptions(famGender).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 8: Communities */}
          {currentStep === 8 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                  Optional
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  Are there communities that are important to you?
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  A hometown association, diaspora union, or cultural group.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Community Name
                  </label>
                  <input
                    type="text"
                    value={commName}
                    onChange={(e) => setCommName(e.target.value)}
                    placeholder="e.g. Igbo Cultural Union UK, or Hometown Youth Association"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Community Type
                  </label>
                  <select
                    value={commType}
                    onChange={(e) => setCommType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                  >
                    <option value="hometown">Hometown Community</option>
                    <option value="diaspora">Diaspora Community</option>
                    <option value="cultural_association">Cultural / Community Association</option>
                    <option value="village">Village Community</option>
                    <option value="local">Local Community</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 9: Other connected places */}
          {currentStep === 9 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                  Optional
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
                  Are there other places that are important to you?
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  A birthplace, study location, work place, or connected city.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Place Name
                  </label>
                  <input
                    type="text"
                    value={otherPlace}
                    onChange={(e) => setOtherPlace(e.target.value)}
                    placeholder="e.g. Oxford, Edinburgh, or Accra"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={otherCountry}
                    onChange={(e) => setOtherCountry(e.target.value)}
                    placeholder="e.g. United Kingdom"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>
            {currentStep > 2 && (
              <button
                type="button"
                onClick={prevStep}
                disabled={saving}
                className="inline-flex items-center space-x-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* If step is optional (steps 6-9), show Skip */}
            {currentStep >= 6 && currentStep <= 9 && (
              <button
                type="button"
                onClick={nextStep}
                disabled={saving}
                className="text-sm text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5"
              >
                Skip for now
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              disabled={saving}
              className="inline-flex items-center space-x-2 py-2 px-5 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-medium transition shadow-xs disabled:opacity-60"
            >
              <span>{currentStep === 9 ? 'Finish & Open GeoSmart' : 'Continue'}</span>
              {currentStep === 9 ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
