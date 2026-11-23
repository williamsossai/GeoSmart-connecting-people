import React, { useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import { ShieldCheck, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';

function mapAuthErrorMessage(err: any): string {
  switch (err?.code) {
    case 'auth/operation-not-allowed':
      return 'Email & password sign-in is not enabled in this Firebase project yet. Click "Continue with Google" above, or enable the Email/Password sign-in method in the Firebase Console.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. If you originally signed in with Google, click "Continue with Google" above.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Try signing in instead, or click "Continue with Google".';
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 8 characters).';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return `This app domain (${window.location.hostname}) is not authorized for Firebase sign-in. Add it to Firebase Console → Authentication → Settings → Authorized domains.`;
    default:
      return err?.message || 'Authentication failed. Please check your details and try again.';
  }
}

export const AuthModal: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName.trim() || undefined);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await resetPassword(email);
      setNotice(`Password reset email sent to ${email.trim()}. Check your inbox to set a new password.`);
    } catch (err: any) {
      setError(mapAuthErrorMessage(err));
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

          {notice && (
            <div className="mb-5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
              <span>{notice}</span>
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
              {mode === 'signup' ? 'Create email & password account' : 'Email & password account'}
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05224C] focus:border-transparent"
                  />
                </div>
              </div>
            )}

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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleForgotPassword()}
                    className="text-[11px] font-medium text-[#05224C] hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
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
              <span>{mode === 'signup' ? 'Create account' : 'Sign in'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
            {mode === 'signin' ? (
              <p>
                New to GeoSmart?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                    setNotice(null);
                  }}
                  className="font-semibold text-[#05224C] hover:underline"
                >
                  Create an email account
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setNotice(null);
                  }}
                  className="font-semibold text-[#05224C] hover:underline"
                >
                  Sign in instead
                </button>
              </p>
            )}
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
