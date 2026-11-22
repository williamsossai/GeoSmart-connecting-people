import React, { useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ isOpen, onClose }) => {
  const { idToken, signOut } = useAuth();
  const [confirmWord, setConfirmWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (confirmWord !== 'DELETE' || !idToken) return;
    setDeleting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) {
        throw new Error('Failed to delete account');
      }

      await signOut();
      onClose();
    } catch (err) {
      console.error('Account deletion failed:', err);
      setErrorMsg('Failed to complete account deletion. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-200 overflow-hidden">
        <div className="bg-red-600 px-6 py-4 text-white flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <h3 className="font-bold text-base">Permanently Delete Account</h3>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            This will permanently remove your user profile, personal information, place
            connections, community ties, and family relationships from the database.
          </p>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            <strong>Warning:</strong> This action cannot be reversed. You will immediately be signed out.
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none font-mono"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmWord !== 'DELETE' || deleting}
              onClick={handleDelete}
              className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleting ? 'Deleting...' : 'Permanently Delete'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
