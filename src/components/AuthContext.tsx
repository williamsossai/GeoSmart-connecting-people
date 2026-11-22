import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { GeoSmartOverview } from '../types.ts';

export interface AppAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  getIdToken?: () => Promise<string>;
}

interface AuthContextType {
  currentUser: AppAuthUser | User | null;
  idToken: string | null;
  loading: boolean;
  serviceError: string | null;
  userOverview: GeoSmartOverview | null;
  refreshOverview: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_SESSION_KEY = 'geosmart_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppAuthUser | User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [userOverview, setUserOverview] = useState<GeoSmartOverview | null>(null);

  const fetchOverview = async (token: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/user/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServiceError(null);
        setUserOverview(data);
        return true;
      } else if (res.status === 401) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        setCurrentUser(null);
        setIdToken(null);
        setUserOverview(null);
        setServiceError(null);
        return false;
      } else if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setServiceError(data.error || 'GeoSmart account storage is unavailable.');
      } else {
        const data = await res.json().catch(() => ({}));
        setServiceError(data.error || 'Your account is signed in, but GeoSmart could not load your details. Please try again.');
      }
    } catch (err) {
      console.error('Failed to load user overview:', err);
      setServiceError('Your account is signed in, but GeoSmart could not load your details. Check your connection and try again.');
    }
    return false;
  };

  const refreshOverview = async () => {
    if (idToken) {
      setServiceError(null);
      await fetchOverview(idToken);
    }
  };

  useEffect(() => {
    // 1. Check local session (from email/password login)
    let hasLocalSession = false;
    const stored = localStorage.getItem(LOCAL_SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.token && parsed?.user) {
          hasLocalSession = true;
          setCurrentUser(parsed.user);
          setIdToken(parsed.token);
          fetchOverview(parsed.token).finally(() => {
            setLoading(false);
          });
        }
      } catch {
        localStorage.removeItem(LOCAL_SESSION_KEY);
      }
    }

    // 2. Listen to Firebase Google Auth state
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        setCurrentUser(user);
        try {
          // Force a refresh so an expired cached token does not strand the user
          // on the sign-in screen after Firebase has successfully authenticated.
          const token = await user.getIdToken(true);
          setIdToken(token);
          await fetchOverview(token);
        } catch (error) {
          console.error('Error fetching token:', error);
        }
        setLoading(false);
      } else if (!hasLocalSession) {
        // Only clear if we don't have an active email/password session
        const currentStored = localStorage.getItem(LOCAL_SESSION_KEY);
        if (!currentStored) {
          setIdToken(null);
          setUserOverview(null);
          setCurrentUser(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const handleSignInWithEmail = async (email: string, pass: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to sign in. Please verify your email and password.');
    }

    const appUser: AppAuthUser = {
      uid: data.user.uid,
      email: data.user.email,
      displayName: data.user.displayName,
      photoURL: null,
      getIdToken: async () => data.token,
    };

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ token: data.token, user: appUser }));
    setCurrentUser(appUser);
    setIdToken(data.token);
    await fetchOverview(data.token);
  };

  const handleSignUpWithEmail = async (email: string, pass: string, name?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, displayName: name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to register account.');
    }

    const appUser: AppAuthUser = {
      uid: data.user.uid,
      email: data.user.email,
      displayName: data.user.displayName,
      photoURL: null,
      getIdToken: async () => data.token,
    };

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ token: data.token, user: appUser }));
    setCurrentUser(appUser);
    setIdToken(data.token);
    await fetchOverview(data.token);
  };

  const handleResetPassword = async (email: string) => {
    void email;
    throw new Error('Password reset is not configured for GeoSmart email/password accounts yet. Please use Google sign-in or contact support.');
  };

  const handleSignOut = async () => {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Firebase signout skipped:', err);
    }
    setCurrentUser(null);
    setIdToken(null);
    setUserOverview(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        idToken,
        loading,
        serviceError,
        userOverview,
        refreshOverview,
        signInWithGoogle: handleSignInWithGoogle,
        signInWithEmail: handleSignInWithEmail,
        signUpWithEmail: handleSignUpWithEmail,
        resetPassword: handleResetPassword,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
