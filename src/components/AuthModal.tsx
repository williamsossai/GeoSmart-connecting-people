import React, { useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import { ShieldCheck, Mail, Lock, AlertCircle } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      console.error('Auth error:', err);
      const msg = err.message || 'Authentication failed. Please check your credentials.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      switch (err?.code) {
        case 'auth/popup-closed-by-user':
          setError('Google sign-in was closed before it finished. Please try again.');
          break;
        case 'auth/popup-blocked':
          setError('Your browser blocked the Google sign-in window. Allow pop-ups for this site or open the app in a full browser.');
          break;
        case 'auth/unauthorized-domain':
          setError(`This app domain (${window.location.hostname}) is not authorized for Firebase sign-in. Add it to the Firebase Authentication authorized domains.`);
          break;
        case 'auth/operation-not-allowed':
          setError('Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication.');
          break;
        default:
          setError(err?.message || 'Google sign-in failed. Check the browser console for details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
        {/* Brand Header */}
        <div className="bg-[#05224C] px-6 py-8 text-center text-white">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-white/10 text-sky-300 font-bold text-xl mb-3 shadow-sm">
            GS
          </div>
          <h1 className="text-2xl font-bold tracking-tight">GeoSmart</h1>
          <p className="text-sm text-slate-300 mt-1 font-light">
            Individual Relationship Foundation
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Google Sign-in Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={submitting}
            className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-medium text-sm transition shadow-xs disabled:opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <span className="relative px-3 bg-white text-xs text-slate-500 font-medium uppercase tracking-wider">
              Existing email & password account
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05224C] focus:border-transparent"
                />
              </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05224C] focus:border-transparent"
                  />
                </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-[#05224C] hover:bg-[#07306b] text-white font-medium text-sm flex items-center justify-center space-x-2 transition shadow-sm disabled:opacity-60"
            >
              <span>Sign in</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
            <p>New to GeoSmart? Continue with Google to create your account.</p>
          </div>

          <div className="mt-4 flex items-center justify-center space-x-1.5 text-[11px] text-slate-400 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secure authentication & encrypted data storage</span>
          </div>
        </div>
      </div>
    </div>
  );
};
