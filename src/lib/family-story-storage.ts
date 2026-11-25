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

    let bucketMissing = response.status === 404;
    if (response.status === 400) {
      const errBody = (await response.clone().json().catch(() => null)) as
        | { statusCode?: string | number; code?: string; message?: string; error?: string }
        | null;
      if (
        String(errBody?.statusCode || '') === '404' ||
        errBody?.code === 'NoSuchBucket' ||
        /not found/i.test(`${errBody?.message || ''} ${errBody?.error || ''}`)
      ) {
        bucketMissing = true;
      }
    }

    if (bucketMissing) {
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
      if (response.ok) {
        response = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
          headers: storageHeaders(serviceKey),
        });
      }
    }
    if (response.status === 401 || response.status === 403) {
      return {
        configured: true,
        ready: false,
        message: 'Supabase Storage rejected the configured secret key. Verify SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.',
      };
    }
    if (!response.ok) return { configured: true, ready: false, message: `The private ${bucket} bucket could not be created or accessed (HTTP ${response.status}).` };
    const details = await response.json() as { public?: boolean };
    if (details.public !== false) {
      return { configured: true, ready: false, message: `The ${bucket} bucket must be private. Set it to private in Supabase Storage before uploading.` };
    }
    return { configured: true, ready: true, message: null };
  } catch (error: any) {
    const code = error?.cause?.code || error?.code;
    if (code === 'ENOTFOUND') {
      return {
        configured: true,
        ready: false,
        message: 'The configured SUPABASE_URL host could not be found in DNS. Verify that SUPABASE_URL uses your full Supabase Project URL (https://<20-char-project-ref>.supabase.co).',
      };
    }
    return { configured: true, ready: false, message: 'Supabase Storage could not be reached.' };
  }
}

function getStorageConfig() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!rawUrl || !secretKey) {
    throw new Error('Family story storage is not configured.');
  }
  let baseUrl = rawUrl.replace(/\/+$/, '');
  try {
    baseUrl = new URL(rawUrl).origin;
  } catch {
    // Keep trimmed string so fetch surfaces the invalid URL cleanly.
  }
  return {
    baseUrl,
    secretKey,
    bucket: process.env.SUPABASE_STORY_BUCKET?.trim() || DEFAULT_BUCKET,
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
  const mediaUrl =
    signedUrl.startsWith('http://') || signedUrl.startsWith('https://')
      ? signedUrl
      : signedUrl.startsWith('/storage/v1/')
        ? `${baseUrl}${signedUrl}`
        : `${baseUrl}/storage/v1${signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`}`;
  return fetch(mediaUrl, { headers: range ? { Range: range } : undefined });
}
