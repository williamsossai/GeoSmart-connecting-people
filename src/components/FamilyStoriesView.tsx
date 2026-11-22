import React, { useEffect, useState } from 'react';
import { Lock, Mic, Play, Trash2, Upload, Users, Video } from 'lucide-react';
import { useAuth } from './AuthContext.tsx';
import type { FamilyStorySummary } from '../types.ts';

const MAX_STORY_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FamilyStoriesView: React.FC = () => {
  const { idToken } = useAuth();
  const [stories, setStories] = useState<FamilyStorySummary[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState('Checking private media storage…');
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

  const loadStories = async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const response = await fetch('/api/family/stories', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load family stories.');
      setStories(data.stories || []);
      setStorageReady(Boolean(data.storageReady));
      setStorageMessage(data.storageMessage || 'Private media storage is ready.');
    } catch (loadError: any) {
      setError(loadError.message || 'Could not load family stories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStories();
  }, [idToken]);

  useEffect(() => () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  }, [mediaUrl]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!idToken || !file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/family/stories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': file.type,
          'X-Story-Title': encodeURIComponent(title.trim()),
          'X-Story-Description': encodeURIComponent(description.trim()),
          'X-Story-Visibility': visibility,
          'X-Story-Consent': consentConfirmed ? 'true' : 'false',
        },
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save this story.');
      setTitle('');
      setDescription('');
      setVisibility('private');
      setConsentConfirmed(false);
      setFile(null);
      setNotice('Your story was saved privately.');
      await loadStories();
    } catch (uploadError: any) {
      setError(uploadError.message || 'Could not save this story.');
    } finally {
      setUploading(false);
    }
  };

  const playStory = async (story: FamilyStorySummary) => {
    if (!idToken) return;
    setMediaLoadingId(story.id);
    setError(null);
    try {
      const response = await fetch(`/api/family/stories/${story.id}/media`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not load this story.');
      }
      const blob = await response.blob();
      setMediaUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setActiveStoryId(story.id);
    } catch (playError: any) {
      setError(playError.message || 'Could not load this story.');
    } finally {
      setMediaLoadingId(null);
    }
  };

  const deleteStory = async (story: FamilyStorySummary) => {
    if (!idToken) return;
    setDeletingId(story.id);
    setError(null);
    try {
      const response = await fetch(`/api/family/stories/${story.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete this story.');
      if (activeStoryId === story.id) {
        if (mediaUrl) URL.revokeObjectURL(mediaUrl);
        setMediaUrl(null);
        setActiveStoryId(null);
      }
      setStories((current) => current.filter((item) => item.id !== story.id));
      setNotice('The story and its stored media were deleted.');
    } catch (deleteError: any) {
      setError(deleteError.message || 'Could not delete this story.');
    } finally {
      setDeletingId(null);
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

      {!storageReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Private media storage needs setup</p>
          <p className="mt-1 text-xs">{storageMessage} Apply the database migrations and configure the server-only Supabase Storage key to enable uploads.</p>
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
              <input type="file" accept="audio/mp4,audio/mpeg,audio/ogg,audio/webm,audio/x-m4a,video/mp4,video/quicktime,video/webm" required onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" />
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
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                    {story.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {story.visibility === 'private' ? 'Private' : 'Family'}
                  </span>
                </div>
                {story.description && <p className="mt-3 text-xs leading-relaxed text-slate-600">{story.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{formatFileSize(story.fileSize)}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void playStory(story)} disabled={mediaLoadingId === story.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#05224C] hover:bg-slate-50 disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" />{mediaLoadingId === story.id ? 'Loading…' : activeStoryId === story.id ? 'Reload' : 'Play'}
                    </button>
                    {story.isOwner && <button type="button" onClick={() => void deleteStory(story)} disabled={deletingId === story.id} aria-label={`Delete ${story.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
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
    </div>
  );
};
