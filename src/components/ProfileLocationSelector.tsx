import React, { useEffect, useState } from 'react';

interface CountryOption {
  id: number;
  code: string;
  name: string;
}

interface RegionOption {
  id: number;
  code: string;
  name: string;
}

interface PlaceOption {
  id: number;
  name: string;
  country: string;
  stateRegion: string | null;
}

export interface ProfileLocationSelection {
  name: string;
  country: string;
  countryCode: string;
  stateRegion: string | null;
  townCity: string | null;
  summary: string;
}

interface ProfileLocationSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: ProfileLocationSelection | null) => void;
}

const selectClassName = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#05224C] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500';

export const ProfileLocationSelector: React.FC<ProfileLocationSelectorProps> = ({ label, value, onChange, onSelectionChange }) => {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [regionId, setRegionId] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/locations/countries')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the country list. Please try again.');
        return response.json() as Promise<CountryOption[]>;
      })
      .then((data) => { if (!cancelled) setCountries(data); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'Could not load the country list.'); })
      .finally(() => { if (!cancelled) setCountriesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setRegions([]);
    setRegionId('');
    setPlaces([]);
    setPlaceId('');
    if (!countryCode) {
      setRegionsLoading(false);
      return;
    }
    let cancelled = false;
    setRegionsLoading(true);
    fetch(`/api/locations/regions?countryCode=${encodeURIComponent(countryCode)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load regions for this country.');
        return response.json() as Promise<RegionOption[]>;
      })
      .then((data) => { if (!cancelled) setRegions(data); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'Could not load regions for this country.'); })
      .finally(() => { if (!cancelled) setRegionsLoading(false); });
    return () => { cancelled = true; };
  }, [countryCode]);

  useEffect(() => {
    setPlaces([]);
    setPlaceId('');
    if (!countryCode || regionsLoading || (regions.length > 0 && !regionId)) {
      setPlacesLoading(false);
      return;
    }
    let cancelled = false;
    setPlacesLoading(true);
    const regionQuery = regionId ? `&regionId=${encodeURIComponent(regionId)}` : '';
    fetch(`/api/locations/places?countryCode=${encodeURIComponent(countryCode)}${regionQuery}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load places for this area.');
        return response.json() as Promise<PlaceOption[]>;
      })
      .then((data) => { if (!cancelled) setPlaces(data); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'Could not load places for this area.'); })
      .finally(() => { if (!cancelled) setPlacesLoading(false); });
    return () => { cancelled = true; };
  }, [countryCode, regionId, regions, regionsLoading]);

  const updateSummary = (nextCountryCode: string, nextRegionId: string, nextPlaceId: string) => {
    const country = countries.find((item) => item.code === nextCountryCode);
    const region = regions.find((item) => String(item.id) === nextRegionId);
    const place = places.find((item) => String(item.id) === nextPlaceId);
    const parts = place
      ? [place.name, place.stateRegion || region?.name, country?.name]
      : region
        ? [region.name, country?.name]
        : [country?.name];
    const summary = parts.filter(Boolean).join(', ');
    onChange(summary);
    if (!country) {
      onSelectionChange?.(null);
      return;
    }
    onSelectionChange?.({
      name: place?.name || region?.name || country.name,
      country: country.name,
      countryCode: country.code,
      stateRegion: place?.stateRegion || region?.name || null,
      townCity: place?.name || null,
      summary,
    });
  };

  const hasCurrentValue = Boolean(value && !countryCode);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">{label}</label>
      {hasCurrentValue && (
        <p className="text-xs text-slate-500">Current: <span className="font-medium text-slate-700">{value}</span>. Select a new location below to replace it.</p>
      )}
      <select
        aria-label={`${label} country`}
        value={countryCode}
        disabled={countriesLoading || countries.length === 0}
        onChange={(event) => {
          const next = event.target.value;
          setCountryCode(next);
          setError(null);
          updateSummary(next, '', '');
        }}
        className={selectClassName}
      >
        <option value="">{countriesLoading ? 'Loading countries…' : 'Select a country'}</option>
        {countries.map((country) => <option key={country.id} value={country.code}>{country.name}</option>)}
      </select>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          aria-label={`${label} region`}
          value={regionId}
          disabled={!countryCode || regionsLoading || regions.length === 0}
          onChange={(event) => {
            const next = event.target.value;
            setRegionId(next);
            setPlaceId('');
            setError(null);
            updateSummary(countryCode, next, '');
          }}
          className={selectClassName}
        >
          <option value="">{regionsLoading ? 'Loading regions…' : regions.length ? 'Select a region / state' : countryCode ? 'No regions available' : 'Choose a country first'}</option>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
        <select
          aria-label={`${label} town or city`}
          value={placeId}
          disabled={!countryCode || regionsLoading || placesLoading || (regions.length > 0 && !regionId)}
          onChange={(event) => {
            const next = event.target.value;
            setPlaceId(next);
            setError(null);
            updateSummary(countryCode, regionId, next);
          }}
          className={selectClassName}
        >
          <option value="">{placesLoading ? 'Loading towns and cities…' : 'Select a town / city'}</option>
          {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
