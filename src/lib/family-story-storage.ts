const DEFAULT_BUCKET = 'family-stories';
const STORY_BUCKET_LIMIT = 50 * 1024 * 1024;
const STORY_MIME_TYPES = [
  'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/x-m4a',
  'video/mp4', 'video/quicktime', 'video/webm',
];

export function familyStoryStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export async function getFamilyStoryStorageStatus() {
  if (!familyStoryStorageConfigured()) {
    return { configured: false, ready: false, message: 'Server-side Supabase Storage credentials are missing.' };
  }
  const { baseUrl, secretKey: serviceKey, bucket } = getStorageConfig();
  try {
    let response = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      headers: storageHeaders(serviceKey),
    });
    if (response.status === 404) {
      response = await fetch(`${baseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: storageHeaders(serviceKey, 'application/json'),
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: false,
          file_size_limit: STORY_BUCKET_LIMIT,
          allowed_mime_types: STORY_MIME_TYPES,
        }),
      });
      // Another server instance may have created it between the lookup and create.
      if (response.status === 409) {
        response = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
          headers: storageHeaders(serviceKey),
        });
      }
    }
    if (!response.ok) return { configured: true, ready: false, message: 'The private family-stories bucket could not be created or accessed.' };
    const details = await response.json() as { public?: boolean };
    if (details.public !== false) {
      return { configured: true, ready: false, message: 'The family-stories bucket must be private. Set it to private in Supabase Storage before uploading.' };
    }
    return { configured: true, ready: true, message: null };
  } catch {
    return { configured: true, ready: false, message: 'Supabase Storage could not be reached.' };
  }
}

function getStorageConfig() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !secretKey) {
    throw new Error('Family story storage is not configured.');
  }
  return {
    baseUrl,
    secretKey,
    bucket: process.env.SUPABASE_STORY_BUCKET || DEFAULT_BUCKET,
  };
}

function encodedPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function storageHeaders(secretKey: string, contentType?: string) {
  return {
    apikey: secretKey,
    ...(!secretKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${secretKey}` } : {}),
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

export async function uploadFamilyStoryObject(path: string, contentType: string, bytes: Buffer) {
  const { baseUrl, secretKey, bucket } = getStorageConfig();
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: 'POST',
    headers: { ...storageHeaders(secretKey, contentType), 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    throw new Error(`Media upload failed (${response.status}).`);
  }
}

export async function deleteFamilyStoryObject(path: string) {
  const { baseUrl, secretKey, bucket } = getStorageConfig();
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers: { ...storageHeaders(secretKey, 'application/json') },
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!response.ok) {
    throw new Error(`Media delete failed (${response.status}).`);
  }
}

export async function fetchFamilyStoryObject(path: string, range?: string) {
  const { baseUrl, secretKey, bucket } = getStorageConfig();
  const signResponse = await fetch(`${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: 'POST',
    headers: storageHeaders(secretKey, 'application/json'),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!signResponse.ok) throw new Error(`Could not authorize media playback (${signResponse.status}).`);
  const result = await signResponse.json() as { signedURL?: string; signedUrl?: string };
  const signedUrl = result.signedURL || result.signedUrl;
  if (!signedUrl) throw new Error('Storage did not return a playback URL.');
  const mediaUrl = new URL(signedUrl, `${baseUrl}/`).toString();
  return fetch(mediaUrl, { headers: range ? { Range: range } : undefined });
}
