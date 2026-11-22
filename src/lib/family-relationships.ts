import type { RelationshipType } from '../types.ts';

export type FamilyGender = 'female' | 'male' | 'unspecified';

export const familyGenderOptions: Array<{ value: FamilyGender; label: string }> = [
  { value: 'unspecified', label: 'Prefer not to say / unspecified' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const genderKey = (gender?: string | null) => (gender || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export function getRelationshipLabel(type: RelationshipType | 'self' | string, gender?: string | null): string {
  if (type === 'self') return 'You';
  const normalizedGender = genderKey(gender);
  const isFemale = normalizedGender === 'female' || normalizedGender === 'woman';
  const isMale = normalizedGender === 'male' || normalizedGender === 'man';

  switch (type) {
    case 'parent': return isFemale ? 'Mother' : isMale ? 'Father' : 'Parent';
    case 'child': return isFemale ? 'Daughter' : isMale ? 'Son' : 'Child';
    case 'sibling': return isFemale ? 'Sister' : isMale ? 'Brother' : 'Sibling';
    case 'grandparent': return isFemale ? 'Grandmother' : isMale ? 'Grandfather' : 'Grandparent';
    case 'grandchild': return isFemale ? 'Granddaughter' : isMale ? 'Grandson' : 'Grandchild';
    case 'spouse': return isFemale ? 'Wife' : isMale ? 'Husband' : 'Spouse / Partner';
    case 'relative': return 'Extended Relative';
    case 'other': return 'Other Connection';
    default: return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Family Connection';
  }
}

export function getRelationshipOptions(gender?: string | null): Array<{ value: RelationshipType; label: string }> {
  return [
    { value: 'parent', label: getRelationshipLabel('parent', gender) },
    { value: 'spouse', label: getRelationshipLabel('spouse', gender) },
    { value: 'child', label: getRelationshipLabel('child', gender) },
    { value: 'sibling', label: getRelationshipLabel('sibling', gender) },
    { value: 'grandparent', label: getRelationshipLabel('grandparent', gender) },
    { value: 'grandchild', label: getRelationshipLabel('grandchild', gender) },
    { value: 'relative', label: 'Extended Relative' },
    { value: 'other', label: 'Other Connection' },
  ];
}
