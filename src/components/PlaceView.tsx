import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  MapPin,
  Plus,
  Trash2,
  Globe,
  Home,
  Compass,
  Briefcase,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Landmark,
  Pencil,
} from 'lucide-react';
import type { PlaceConnectionType, PlaceWithConnection, VisibilitySetting } from '../types.ts';

interface LocationCountryOption { id: number; code: string; name: string }
interface LocationRegionOption { id: number; code: string; name: string }
interface LocationDistrictOption { id: number; name: string; stateName: string; regionId: number }
interface LocationPlaceOption { id: number; name: string; country: string; stateRegion: string | null }

const locationSelectClass = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500';

export const PlaceView: React.FC = () => {
  const { idToken, refreshOverview } = useAuth();
  const [places, setPlaces] = useState<PlaceWithConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlace, setEditingPlace] = useState<PlaceWithConnection | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // In-app Disconnect Confirmation Modal
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: number; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [districtLga, setDistrictLga] = useState('');
  const [townCity, setTownCity] = useState('');
  const [villageLocality, setVillageLocality] = useState('');
  const [locationCountries, setLocationCountries] = useState<LocationCountryOption[]>([]);
  const [locationRegions, setLocationRegions] = useState<LocationRegionOption[]>([]);
  const [locationDistricts, setLocationDistricts] = useState<LocationDistrictOption[]>([]);
  const [locationPlaces, setLocationPlaces] = useState<LocationPlaceOption[]>([]);
  const [locationCountryCode, setLocationCountryCode] = useState('');
  const [locationRegionId, setLocationRegionId] = useState('');
  const [selectedLocalityId, setSelectedLocalityId] = useState('');
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [countryManual, setCountryManual] = useState(false);
  const [regionManual, setRegionManual] = useState(false);
  const [districtManual, setDistrictManual] = useState(false);
  const [localityManual, setLocalityManual] = useState(false);
  const [connectionType, setConnectionType] = useState<PlaceConnectionType>('residence');
  const [humanLabel, setHumanLabel] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<VisibilitySetting>('private');
  const [submitting, setSubmitting] = useState(false);

  const fetchPlaces = async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/places', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlaces(data);
      }
    } catch (err) {
      console.error('Failed to load places:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces();
  }, [idToken]);

  useEffect(() => {
    if (!showAddModal) return;
    let cancelled = false;
    setCountriesLoading(true);
    fetch('/api/locations/countries')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load the country list.');
        return res.json() as Promise<LocationCountryOption[]>;
      })
      .then((data) => { if (!cancelled) setLocationCountries(data); })
      .catch((error) => { if (!cancelled) setLocationError(error.message || 'Could not load the country list.'); })
      .finally(() => { if (!cancelled) setCountriesLoading(false); });
    return () => { cancelled = true; };
  }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal || !editingPlace || !locationCountries.length || locationCountryCode) return;
    const match = locationCountries.find((option) => option.name.toLocaleLowerCase() === country.trim().toLocaleLowerCase());
    if (match) {
      setLocationCountryCode(match.code);
      setCountryManual(false);
    } else if (country) {
      setCountryManual(true);
      setRegionManual(Boolean(stateRegion));
      setDistrictManual(Boolean(districtLga));
      setLocalityManual(Boolean(villageLocality));
    }
  }, [showAddModal, editingPlace, locationCountries, locationCountryCode, country, stateRegion, districtLga, villageLocality]);

  useEffect(() => {
    setLocationRegions([]);
    setLocationDistricts([]);
    setLocationPlaces([]);
    setSelectedLocalityId('');
    if (!showAddModal || !locationCountryCode) {
      setRegionsLoading(false);
      return;
    }
    let cancelled = false;
    setRegionsLoading(true);
    fetch(`/api/locations/regions?countryCode=${encodeURIComponent(locationCountryCode)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load regions for this country.');
        return res.json() as Promise<LocationRegionOption[]>;
      })
      .then((data) => { if (!cancelled) setLocationRegions(data); })
      .catch((error) => { if (!cancelled) setLocationError(error.message || 'Could not load regions for this country.'); })
      .finally(() => { if (!cancelled) setRegionsLoading(false); });
    return () => { cancelled = true; };
  }, [showAddModal, locationCountryCode]);

  useEffect(() => {
    if (!showAddModal || !editingPlace || !stateRegion || locationRegionId || regionsLoading) return;
    if (!locationRegions.length) {
      setRegionManual(true);
      return;
    }
    const match = locationRegions.find((option) => option.name.toLocaleLowerCase() === stateRegion.trim().toLocaleLowerCase());
    if (match) {
      setLocationRegionId(String(match.id));
      setRegionManual(false);
    } else {
      setRegionManual(true);
    }
  }, [showAddModal, editingPlace, stateRegion, locationRegionId, locationRegions, regionsLoading]);

  useEffect(() => {
    if (!showAddModal || !locationCountryCode || regionsLoading) {
      setDistrictsLoading(false);
      setPlacesLoading(false);
      return;
    }
    let cancelled = false;
    setDistrictsLoading(true);
    const regionQuery = locationRegionId ? `&regionId=${encodeURIComponent(locationRegionId)}` : '';
    fetch(`/api/locations/districts?countryCode=${encodeURIComponent(locationCountryCode)}${regionQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load districts for this area.');
        return res.json() as Promise<LocationDistrictOption[]>;
      })
      .then((data) => { if (!cancelled) setLocationDistricts(data); })
      .catch((error) => { if (!cancelled) setLocationError(error.message || 'Could not load districts for this area.'); })
      .finally(() => { if (!cancelled) setDistrictsLoading(false); });

    if (locationRegions.length > 0 && !locationRegionId) {
      setLocationPlaces([]);
      setPlacesLoading(false);
    } else {
      setPlacesLoading(true);
      fetch(`/api/locations/places?countryCode=${encodeURIComponent(locationCountryCode)}${regionQuery}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('Could not load populated places for this area.');
          return res.json() as Promise<LocationPlaceOption[]>;
        })
        .then((data) => { if (!cancelled) setLocationPlaces(data); })
        .catch((error) => { if (!cancelled) setLocationError(error.message || 'Could not load populated places for this area.'); })
        .finally(() => { if (!cancelled) setPlacesLoading(false); });
    }
    return () => { cancelled = true; };
  }, [showAddModal, locationCountryCode, locationRegionId, locationRegions, regionsLoading]);

  useEffect(() => {
    if (!showAddModal || !editingPlace || !districtLga || districtsLoading || districtManual) return;
    if (!locationDistricts.some((option) => option.name.toLocaleLowerCase() === districtLga.trim().toLocaleLowerCase())) {
      setDistrictManual(true);
    }
  }, [showAddModal, editingPlace, districtLga, districtsLoading, districtManual, locationDistricts]);

  useEffect(() => {
    if (!showAddModal || !editingPlace || !villageLocality || placesLoading || selectedLocalityId || localityManual) return;
    const match = locationPlaces.find((option) => option.name.toLocaleLowerCase() === villageLocality.trim().toLocaleLowerCase());
    if (match) {
      setSelectedLocalityId(String(match.id));
      setLocalityManual(false);
    } else {
      setLocalityManual(true);
    }
  }, [showAddModal, editingPlace, villageLocality, placesLoading, selectedLocalityId, localityManual, locationPlaces]);

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(editingPlace ? `/api/places/${editingPlace.connectionId}` : '/api/places', {
        method: editingPlace ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          country: country.trim(),
          stateRegion: stateRegion.trim() || undefined,
          districtLga: districtLga.trim() || undefined,
          townCity: townCity.trim() || undefined,
          villageLocality: villageLocality.trim() || undefined,
          placeType: 'geographic_place',
          connectionType,
          humanLabel: humanLabel.trim() || undefined,
          isCurrent,
          notes: notes.trim() || undefined,
          visibility,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${editingPlace ? 'update' : 'add'} place connection`);
      }

      await fetchPlaces();
      await refreshOverview();
      setShowAddModal(false);
      setEditingPlace(null);
      setName('');
      setCountry('');
      setStateRegion('');
      setLocationCountryCode('');
      setLocationRegionId('');
      setDistrictLga('');
      setTownCity('');
      setVillageLocality('');
      setSelectedLocalityId('');
      setCountryManual(false);
      setRegionManual(false);
      setDistrictManual(false);
      setLocalityManual(false);
      setHumanLabel('');
      setNotes('');
      setIsCurrent(false);
      setSuccessMsg(editingPlace ? 'Place updated successfully.' : 'Place connection added.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error saving place:', err);
      setErrorMsg(err.message || `Failed to ${editingPlace ? 'update' : 'add'} place.`);
    } finally {
      setSubmitting(false);
    }
  };

  const executeRemove = async (connectionId: number, placeName: string) => {
    if (!idToken) return;

    try {
      const res = await fetch(`/api/places/${connectionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove place');
      }
      await fetchPlaces();
      await refreshOverview();
      setSuccessMsg(`Disconnected "${placeName}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Error removing place:', err);
      setErrorMsg(err.message || 'Failed to remove place.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleRemove = (connectionId: number, placeName: string) => {
    setDisconnectTarget({ id: connectionId, name: placeName });
  };

  const openAddPlace = () => {
    setEditingPlace(null);
    setName('');
    setCountry('');
    setStateRegion('');
    setDistrictLga('');
    setTownCity('');
    setVillageLocality('');
    setLocationCountryCode('');
    setLocationRegionId('');
    setSelectedLocalityId('');
    setCountryManual(false);
    setRegionManual(false);
    setDistrictManual(false);
    setLocalityManual(false);
    setConnectionType('residence');
    setHumanLabel('');
    setIsCurrent(false);
    setNotes('');
    setVisibility('private');
    setLocationError(null);
    setErrorMsg(null);
    setShowAddModal(true);
  };

  const openEditPlace = (place: PlaceWithConnection) => {
    setEditingPlace(place);
    setName(place.name || '');
    setCountry(place.country || '');
    setStateRegion(place.stateRegion || '');
    setDistrictLga(place.districtLga || '');
    setTownCity(place.townCity || '');
    setVillageLocality(place.villageLocality || '');
    setLocationCountryCode('');
    setLocationRegionId('');
    setSelectedLocalityId('');
    setCountryManual(false);
    setRegionManual(false);
    setDistrictManual(false);
    setLocalityManual(false);
    setConnectionType(place.connectionType);
    setHumanLabel(place.humanLabel || '');
    setIsCurrent(place.isCurrent);
    setNotes(place.notes || '');
    setVisibility(place.visibility);
    setLocationError(null);
    setErrorMsg(null);
    setShowAddModal(true);
  };

  // Group into four sections as instructed:
  // 1. Where I live
  // 2. Where I'm from
  // 3. My family/ancestral place
  // 4. Other connected places
  const livingPlaces = places.filter((p) => p.connectionType === 'residence' || p.isCurrent);
  const originPlaces = places.filter(
    (p) => (p.connectionType === 'origin' || p.connectionType === 'birth') && !p.isCurrent
  );
  const ancestralPlaces = places.filter((p) => p.connectionType === 'family_ancestral');
  const otherPlaces = places.filter(
    (p) =>
      !['residence', 'family_ancestral'].includes(p.connectionType) &&
      !p.isCurrent &&
      p.connectionType !== 'origin' &&
      p.connectionType !== 'birth'
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#05224C] tracking-tight">
            My Place
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            What places connect to my story? Cities, ancestral homelands, and geographic roots.
          </p>
        </div>

        <button
          onClick={openAddPlace}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-medium transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Connect a Place</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-8">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your Geographic Story</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Organized simply into where you live, where you are from, your family ancestral land, and other places.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading connected places...</div>
        ) : places.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MapPin className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-700">No places connected yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add where you currently reside, your hometown, or ancestral lands to build your map of belonging.
            </p>
            <button
              onClick={openAddPlace}
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#05224C] text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect First Place</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 1. Where I Live */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Home className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Where I Live
                </h3>
              </div>
              {livingPlaces.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-6">No current residence specified.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  {livingPlaces.map((p) => (
                    <PlaceCard key={p.connectionId} place={p} onRemove={handleRemove} />
                  ))}
                </div>
              )}
            </div>

            {/* 2. Where I'm From */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Where I'm From
                </h3>
              </div>
              {originPlaces.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-6">No origin place specified.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  {originPlaces.map((p) => (
                    <PlaceCard key={p.connectionId} place={p} onRemove={handleRemove} />
                  ))}
                </div>
              )}
            </div>

            {/* 3. My Family / Ancestral Place */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  My Family / Ancestral Place
                </h3>
              </div>
              {ancestralPlaces.length === 0 ? (
                <p className="text-xs text-slate-400 italic pl-6">No ancestral place recorded.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  {ancestralPlaces.map((p) => (
                    <PlaceCard key={p.connectionId} place={p} onRemove={handleRemove} />
                  ))}
                </div>
              )}
            </div>

            {/* 4. Other Connected Places */}
            {otherPlaces.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center space-x-2">
                  <Compass className="w-4 h-4 text-purple-700" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Other Connected Places
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  {otherPlaces.map((p) => (
                    <PlaceCard key={p.connectionId} place={p} onRemove={handleRemove} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Place Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#05224C] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Connect a Place</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-300 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPlace} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Place Name / City / Locality
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Asaba, London, or Kumasi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Country
                  </label>
                  <select
                    required
                    value={locationCountryCode}
                    disabled={countriesLoading || locationCountries.length === 0}
                    onChange={(e) => {
                      const nextCode = e.target.value;
                      const selected = locationCountries.find((option) => option.code === nextCode);
                      setLocationCountryCode(nextCode);
                      setCountry(selected?.name || '');
                      setLocationRegionId('');
                      setStateRegion('');
                      setDistrictLga('');
                      setVillageLocality('');
                      setDistrictManual(false);
                      setLocalityManual(false);
                      setLocationError(null);
                    }}
                    className={locationSelectClass}
                  >
                    <option value="">{countriesLoading ? 'Loading countries…' : 'Select a country'}</option>
                    {locationCountries.map((option) => <option key={option.id} value={option.code}>{option.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    State / Region
                  </label>
                  <select
                    value={locationRegionId}
                    disabled={!locationCountryCode || regionsLoading || locationRegions.length === 0}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const selected = locationRegions.find((option) => String(option.id) === nextId);
                      setLocationRegionId(nextId);
                      setStateRegion(selected?.name || '');
                      setDistrictLga('');
                      setVillageLocality('');
                      setDistrictManual(false);
                      setLocalityManual(false);
                      setLocationError(null);
                    }}
                    className={locationSelectClass}
                  >
                    <option value="">{!locationCountryCode ? 'Choose a country first' : regionsLoading ? 'Loading regions…' : locationRegions.length ? 'Select a state / region' : 'No regions listed for this country'}</option>
                    {locationRegions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    District / LGA
                  </label>
                  <select
                    aria-label="District or LGA"
                    value={districtManual ? '__manual' : (locationDistricts.find((option) => option.name === districtLga)?.id ?? '')}
                    disabled={!locationCountryCode || districtsLoading}
                    onChange={(e) => {
                      if (e.target.value === '__manual') {
                        setDistrictManual(true);
                        setDistrictLga('');
                      } else {
                        const selected = locationDistricts.find((option) => String(option.id) === e.target.value);
                        setDistrictManual(false);
                        setDistrictLga(selected?.name || '');
                      }
                    }}
                    className={locationSelectClass}
                  >
                    <option value="">{districtsLoading ? 'Loading districts…' : locationDistricts.length ? 'Select a district / LGA' : locationCountryCode ? 'No standard district list for this country' : 'Choose a country first'}</option>
                    {locationDistricts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    <option value="__manual">Not listed — enter manually</option>
                  </select>
                  {(districtManual || (locationCountryCode && !districtsLoading && locationDistricts.length === 0)) && (
                    <input
                      type="text"
                      value={districtLga}
                      onChange={(e) => setDistrictLga(e.target.value)}
                      placeholder="Enter district / LGA"
                      className={`${locationSelectClass} mt-2`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Village / Locality
                  </label>
                  <select
                    aria-label="Village or locality"
                    value={localityManual ? '__manual' : selectedLocalityId}
                    disabled={!locationCountryCode || placesLoading || (locationRegions.length > 0 && !locationRegionId)}
                    onChange={(e) => {
                      if (e.target.value === '__manual') {
                        setLocalityManual(true);
                        setSelectedLocalityId('');
                        setVillageLocality('');
                      } else {
                        const selected = locationPlaces.find((option) => String(option.id) === e.target.value);
                        setLocalityManual(false);
                        setSelectedLocalityId(e.target.value);
                        setVillageLocality(selected?.name || '');
                        if (selected) setName((current) => current.trim() ? current : selected.name);
                      }
                    }}
                    className={locationSelectClass}
                  >
                    <option value="">{placesLoading ? 'Loading populated places…' : locationPlaces.length ? 'Select a populated place' : 'Choose a region first'}</option>
                    {locationPlaces.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    <option value="__manual">Village not listed — enter manually</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">The list includes towns and cities; smaller villages may need manual entry.</p>
                  {localityManual && (
                    <input
                      type="text"
                      value={villageLocality}
                      onChange={(e) => setVillageLocality(e.target.value)}
                      placeholder="Enter village / locality"
                      className={`${locationSelectClass} mt-2`}
                    />
                  )}
                </div>
              </div>
              {locationError && <p role="alert" className="text-xs text-red-600">{locationError}</p>}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Connection Category
                </label>
                <select
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value as PlaceConnectionType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                >
                  <option value="residence">Where I live (Residence)</option>
                  <option value="origin">Where I'm from (Origin)</option>
                  <option value="family_ancestral">Family / Ancestral Land</option>
                  <option value="birth">Place of Birth</option>
                  <option value="childhood">Childhood Home</option>
                  <option value="study">University / School</option>
                  <option value="work">Workplace</option>
                  <option value="frequent_visit">Frequent Visit</option>
                  <option value="other">Other Connection</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isCurrentCheck"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                  className="rounded border-slate-300 text-[#05224C] focus:ring-[#05224C]"
                />
                <label htmlFor="isCurrentCheck" className="text-xs text-slate-700 font-medium">
                  This is my current living residence
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Custom Label / Note (Optional)
                </label>
                <input
                  type="text"
                  value={humanLabel}
                  onChange={(e) => setHumanLabel(e.target.value)}
                  placeholder="e.g. Hometown or Parent's House"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Privacy Setting
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as VisibilitySetting)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#05224C] focus:outline-none bg-white"
                >
                  <option value="private">Private (Only visible to you)</option>
                  <option value="shared">Shared (Visible to verified family)</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white text-sm font-medium transition disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Connect Place'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal for Disconnecting Place */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-bold text-slate-900 text-base">Disconnect Place?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to disconnect <span className="font-semibold text-slate-800">{disconnectTarget.name}</span> from your profile?
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

const PlaceCard: React.FC<{
  place: PlaceWithConnection;
  onRemove: (id: number, name: string) => void;
}> = ({ place, onRemove }) => {
  const pName = place.name || (place as any).place?.name || 'Place';
  const townCity = place.townCity || (place as any).place?.townCity;
  const stateRegion = place.stateRegion || (place as any).place?.stateRegion;
  const country = place.country || (place as any).place?.country;
  const districtLga = place.districtLga || (place as any).place?.districtLga;

  const formattedSubtitle = [
    townCity || pName,
    stateRegion,
    country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition flex items-start justify-between shadow-2xs">
      <div className="flex items-start space-x-3">
        <div className="p-2 rounded-lg bg-sky-50 text-[#05224C] mt-0.5">
          <MapPin className="w-4 h-4 text-sky-700" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">{pName}</h4>
          <p className="text-xs text-slate-500">{formattedSubtitle}</p>
          {districtLga && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              LGA / District: {districtLga}
            </p>
          )}
          {place.humanLabel && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
              {place.humanLabel}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onRemove(place.connectionId, pName)}
        title="Remove place"
        className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
