import React, { useEffect, useRef, useState } from 'react';
import { Lock, Mic, Play, Trash2, Upload, Users, Video } from 'lucide-react';
import { useAuth } from './AuthContext.tsx';
import type { FamilyStorySummary } from '../types.ts';
import {
  createFamilyStoryFs,
  deleteFamilyStoryFs,
  getFamilyStoriesFs,
  updateFamilyStorySharingFs,
} from '../lib/firestore-repo.ts';

const MAX_STORY_BYTES = 50 * 1024 * 1024;

const EXTENSION_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

function resolveStoryContentType(file: File): string {
  const raw = (file.type || '').split(';')[0].trim().toLowerCase();
  if (raw) return raw;
  const ext = file.name.split('.').pop()?.trim().toLowerCase() || '';
  return EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FamilyStoriesView: React.FC = () => {
  const { currentUser, idToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stories, setStories] = useState<FamilyStorySummary[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState('Checking private media storage configuration…');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'family'>('private');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaLoadingId, setMediaLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [pendingShareStory, setPendingShareStory] = useState<FamilyStorySummary | null>(null);
  const [pendingDeleteStory, setPendingDeleteStory] = useState<FamilyStorySummary | null>(null);

  const getFreshToken = async (): Promise<string> => {
    const token = (await currentUser?.getIdToken?.()) || idToken;
    if (!token) {
      throw new Error('Your session expired. Sign in again to continue.');
    }
    return token;
  };

  const loadStories = async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    try {
      const token = await getFreshToken();
      const [items, statusResponse] = await Promise.all([
        getFamilyStoriesFs(currentUser.uid),
        fetch('/api/family/stories/storage-status', {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (res) => {
          if (!res.ok) return { configured: false, ready: false, message: 'Private media storage status could not be checked.' };
          return (await res.json()) as { configured: boolean; ready: boolean; message: string | null };
        }).catch(() => ({
          configured: false,
          ready: false,
          message: 'Private media storage status could not be checked.',
        })),
      ]);
      setStories(items);
      setStorageReady(Boolean(statusResponse.ready));
      setStorageMessage(
        statusResponse.message || 'Private media storage for audio and video files is not configured in this environment.',
      );
    } catch (loadError: any) {
      setError(loadError.message || 'Could not load family stories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStories();
  }, [currentUser?.uid]);

  useEffect(() => () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  }, [mediaUrl]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser?.uid || !file) return;
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 120) {
      setError('Enter a title up to 120 characters.');
      return;
    }
    if (file.size === 0 || file.size > MAX_STORY_BYTES) {
      setError('Choose a non-empty file smaller than 50 MB.');
      return;
    }
    if (!consentConfirmed) {
      setError('Confirm you have permission from living people featured in this story.');
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);

    let uploadedStoragePath: string | null = null;
    let token: string | null = null;
    try {
      token = await getFreshToken();
      const contentType = resolveStoryContentType(file);
      const uploadResponse = await fetch('/api/family/stories/media', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
        body: file,
      });

      const uploadPayload = (await uploadResponse.json().catch(() => ({}))) as {
        storagePath?: string;
        contentType?: string;
        mediaType?: 'audio' | 'video';
        fileSize?: number;
        error?: string;
      };

      if (!uploadResponse.ok || !uploadPayload.storagePath) {
        throw new Error(uploadPayload.error || 'Could not upload this media file.');
      }

      uploadedStoragePath = uploadPayload.storagePath;

      await createFamilyStoryFs(currentUser.uid, {
        title: cleanTitle,
        description: description.trim(),
        storagePath: uploadPayload.storagePath,
        contentType: uploadPayload.contentType || contentType,
        mediaType: uploadPayload.mediaType || (contentType.startsWith('audio/') ? 'audio' : 'video'),
        fileSize: uploadPayload.fileSize || file.size,
        visibility,
      });

      uploadedStoragePath = null;
      setTitle('');
      setDescription('');
      setVisibility('private');
      setConsentConfirmed(false);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const refreshed = await getFamilyStoriesFs(currentUser.uid);
      setStories(refreshed);
      setNotice(
        visibility === 'family'
          ? 'Your story was saved and shared with your direct family connections.'
          : 'Your private family story was saved.',
      );
    } catch (uploadError: any) {
      if (uploadedStoragePath && token) {
        await fetch('/api/family/stories/media', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storagePath: uploadedStoragePath }),
        }).catch(() => {});
      }
      setError(uploadError.message || 'Could not save this story. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const executeStorySharing = async (
    story: FamilyStorySummary,
    nextVisibility: 'private' | 'family',
  ) => {
    if (!currentUser?.uid || nextVisibility === story.visibility) return;
    setSharingId(story.id);
    setError(null);
    setNotice(null);
    try {
      await updateFamilyStorySharingFs(currentUser.uid, story.id, nextVisibility);
      setStories((current) =>
        current.map((item) => (item.id === story.id ? { ...item, visibility: nextVisibility } : item)),
      );
      setNotice(
        nextVisibility === 'private'
          ? 'This story is private now. Direct family connections can no longer access it.'
          : 'This story is now shared with your direct family connections.',
      );
    } catch (sharingError: any) {
      setError(sharingError.message || 'Could not update story sharing.');
    } finally {
      setSharingId(null);
      setPendingShareStory(null);
    }
  };

  const handleStorySharingChange = (
    story: FamilyStorySummary,
    nextVisibility: 'private' | 'family',
  ) => {
    if (!currentUser?.uid || nextVisibility === story.visibility) return;
    if (nextVisibility === 'family') {
      setPendingShareStory(story);
      return;
    }
    void executeStorySharing(story, 'private');
  };

  const playStory = async (story: FamilyStorySummary) => {
    if (!currentUser?.uid) return;
    if (!story.storyId || !story.storagePath) {
      setError('This story record does not have a playable media file.');
      return;
    }
    setMediaLoadingId(story.id);
    setError(null);
    try {
      const token = await getFreshToken();
      const ownerQuery =
        story.ownerUid && story.ownerUid !== currentUser.uid
          ? `?ownerUid=${encodeURIComponent(story.ownerUid)}`
          : '';
      const response = await fetch(
        `/api/family/stories/${encodeURIComponent(story.storyId)}/media${ownerQuery}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const errPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errPayload.error || 'Story media could not be loaded.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      setMediaUrl(objectUrl);
      setActiveStoryId(story.id);
    } catch (playError: any) {
      setError(playError.message || 'Story media could not be loaded.');
    } finally {
      setMediaLoadingId(null);
    }
  };

  const executeDeleteStory = async (story: FamilyStorySummary) => {
    if (!currentUser?.uid) return;
    setDeletingId(story.id);
    setError(null);
    setNotice(null);
    try {
      const deleted = await deleteFamilyStoryFs(currentUser.uid, story.id);
      if (deleted.storagePath) {
        const token = await getFreshToken();
        await fetch('/api/family/stories/media', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storagePath: deleted.storagePath }),
        }).catch(() => {});
      }
      if (activeStoryId === story.id) {
        if (mediaUrl) URL.revokeObjectURL(mediaUrl);
        setMediaUrl(null);
        setActiveStoryId(null);
      }
      setStories((current) => current.filter((item) => item.id !== story.id));
      setNotice('The story and its media file were deleted.');
    } catch (deleteError: any) {
      setError(deleteError.message || 'Could not delete this story.');
    } finally {
      setDeletingId(null);
      setPendingDeleteStory(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6 sm:py-9">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Family stories</p>
        <h1 className="mt-1 text-2xl font-bold text-[#05224C]">Voice & video memories</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Keep a spoken memory or video connected to your family story. Stories are private by default; direct family sharing is optional.</p>
      </header>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      )}

      {!loading && !storageReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Private media storage needs setup</p>
          <p className="mt-1 text-xs">{storageMessage} Configure server-side object storage to enable audio and video uploads.</p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
        <h2 className="text-base font-bold text-slate-900">Add a story</h2>
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">
              Story title
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" placeholder="A memory worth keeping" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Audio or video file
              <input ref={fileInputRef} type="file" accept="audio/mp4,audio/mpeg,audio/ogg,audio/webm,audio/x-m4a,video/mp4,video/quicktime,video/webm" required onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">MP4, WebM, MP3, OGG, M4A, or QuickTime · up to 50 MB</span>
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-700">
            Description (optional)
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#05224C]" placeholder="Add context for your family…" />
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-xs font-semibold text-slate-700">
              Who can view this story?
              <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'family')} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05224C] sm:max-w-xs">
                <option value="private">Private — only me</option>
                <option value="family">Direct family connections</option>
              </select>
            </label>
            <p className="text-[11px] text-slate-500 sm:max-w-xs">Direct family means account holders connected to you in GeoSmart. There is no public link.</p>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} required className="mt-0.5 accent-[#05224C]" />
            <span>I have the right to share this recording and have permission from every living person whose voice or image appears in it.</span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {file && <span className="text-[11px] text-slate-500">{file.name} · {formatFileSize(file.size)}</span>}
            <button type="submit" disabled={!storageReady || uploading || !file || file.size > MAX_STORY_BYTES} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#05224C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#07306b] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
              <Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Save story'}
            </button>
          </div>
          {file && file.size > MAX_STORY_BYTES && <p className="text-xs text-red-700">Choose a file smaller than 50 MB.</p>}
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Stories you can access</h2>
          <p className="mt-1 text-xs text-slate-500">Private stories are visible only to their owner. Shared stories are available to that person’s direct family connections.</p>
        </div>
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading stories…</p>
        ) : stories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No family stories yet.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {stories.map((story) => (
              <article key={story.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-sky-50 p-2 text-sky-800">{story.mediaType === 'audio' ? <Mic className="h-4 w-4" /> : <Video className="h-4 w-4" />}</div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900">{story.title}</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">{story.ownerName} · {new Date(story.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {story.isOwner ? (
                    <>
                      <label className="sr-only" htmlFor={`story-sharing-${story.id}`}>
                        Sharing for {story.title}
                      </label>
                      <select
                        id={`story-sharing-${story.id}`}
                        aria-label={`Sharing for ${story.title}`}
                        value={story.visibility}
                        disabled={sharingId === story.id}
                        onChange={(event) =>
                          handleStorySharingChange(story, event.target.value as 'private' | 'family')
                        }
                        className="max-w-36 shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 disabled:opacity-60"
                      >
                        <option value="private">Private</option>
                        <option value="family">Share with family</option>
                      </select>
                    </>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                      {story.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      {story.visibility === 'private' ? 'Private' : 'Family'}
                    </span>
                  )}
                </div>
                {story.description && <p className="mt-3 text-xs leading-relaxed text-slate-600">{story.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{formatFileSize(story.fileSize)}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void playStory(story)} disabled={mediaLoadingId === story.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#05224C] hover:bg-slate-50 disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" />{mediaLoadingId === story.id ? 'Loading…' : activeStoryId === story.id ? 'Reload' : 'Play'}
                    </button>
                    {story.isOwner && (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteStory(story)}
                        disabled={deletingId === story.id}
                        aria-label={`Delete ${story.title}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {activeStoryId === story.id && mediaUrl && (story.mediaType === 'audio'
                  ? <audio className="mt-3 w-full" controls src={mediaUrl} />
                  : <video className="mt-3 max-h-80 w-full rounded-lg bg-black" controls playsInline src={mediaUrl} />)}
              </article>
            ))}
          </div>
        )}
      </section>

      {pendingShareStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && sharingId === null) {
              setPendingShareStory(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-story-confirm-title"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="space-y-1.5">
              <h2 id="share-story-confirm-title" className="text-base font-bold text-[#05224C]">
                Share “{pendingShareStory.title}” with family?
              </h2>
              <p className="text-xs leading-relaxed text-slate-600">
                Share this recording with your direct GeoSmart family connections? Confirm that everyone living whose voice or image appears has given permission.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={sharingId !== null}
                onClick={() => setPendingShareStory(null)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sharingId !== null}
                onClick={() => void executeStorySharing(pendingShareStory, 'family')}
                className="flex-1 rounded-xl bg-[#05224C] px-4 py-2 text-xs font-bold text-white hover:bg-[#07306b] disabled:opacity-50"
              >
                {sharingId !== null ? 'Sharing…' : 'Share with family'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && deletingId === null) {
              setPendingDeleteStory(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-story-confirm-title"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="space-y-1.5">
              <h2 id="delete-story-confirm-title" className="text-base font-bold text-slate-900">
                Delete “{pendingDeleteStory.title}”?
              </h2>
              <p className="text-xs leading-relaxed text-slate-600">
                This permanently removes the story record and its uploaded audio or video file for you and any connected family members.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setPendingDeleteStory(null)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void executeDeleteStory(pendingDeleteStory)}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId !== null ? 'Deleting…' : 'Delete story'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
