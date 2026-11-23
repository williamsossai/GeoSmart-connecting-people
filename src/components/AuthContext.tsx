import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { ensureUserDocumentFs, getUserOverviewFs } from '../lib/firestore-repo.ts';
import type { GeoSmartOverview } from '../types.ts';
import { getOfflineOverview, saveOfflineOverview, setOfflineUserScope } from '../lib/offline-vault.ts';

export interface AppAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified?: boolean;
  getIdToken?: () => Promise<string>;
}

interface AuthContextType {
  currentUser: AppAuthUser | User | null;
  idToken: string | null;
  loading: boolean;
  emailVerificationRequired: boolean;
  serviceError: string | null;
  userOverview: GeoSmartOverview | null;
  refreshOverview: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LEGACY_SESSION_KEY = 'geosmart_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppAuthUser | User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [userOverview, setUserOverview] = useState<GeoSmartOverview | null>(null);

  const loadVerifiedUserOverview = async (user: User): Promise<boolean> => {
    try {
      await ensureUserDocumentFs(user);
      const data = await getUserOverviewFs(user.uid);
      setServiceError(null);
      setUserOverview(data);
      void saveOfflineOverview(user.uid, data);
      return true;
    } catch (err) {
      console.error('Failed to load Firestore user overview:', err);
      const offlineOverview = await getOfflineOverview<GeoSmartOverview>(user.uid);
      if (offlineOverview && !navigator.onLine) {
        setUserOverview(offlineOverview);
        setServiceError(null);
        return true;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Your account is signed in, but GeoSmart could not load your details. Check your connection and try again.';
      setServiceError(message);
      return false;
    }
  };

  const refreshOverview = async () => {
    const fbUser = auth.currentUser;
    if (fbUser && fbUser.emailVerified) {
      setServiceError(null);
      await loadVerifiedUserOverview(fbUser);
    }
  };

  useEffect(() => {
    localStorage.removeItem(LEGACY_SESSION_KEY);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setOfflineUserScope(user.uid);
        setCurrentUser(user);

        if (!user.emailVerified) {
          setEmailVerificationRequired(true);
          setIdToken(null);
          setUserOverview(null);
          setServiceError(null);
          setLoading(false);
          return;
        }

        setEmailVerificationRequired(false);
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          await loadVerifiedUserOverview(user);
        } catch (error) {
          console.error('Error initializing signed-in user session:', error);
          const offlineOverview = await getOfflineOverview<GeoSmartOverview>(user.uid);
          if (offlineOverview) {
            setUserOverview(offlineOverview);
            setServiceError(null);
          } else {
            setServiceError('Your account is signed in, but GeoSmart could not verify your session. Reconnect and try again.');
          }
        }
        setLoading(false);
      } else {
        setOfflineUserScope(null);
        setCurrentUser(null);
        setIdToken(null);
        setEmailVerificationRequired(false);
        setUserOverview(null);
        setServiceError(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const handleSignInWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    if (!cred.user.emailVerified) {
      setEmailVerificationRequired(true);
    }
  };

  const handleSignUpWithEmail = async (email: string, pass: string, name?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (name?.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    if (!cred.user.emailVerified) {
      await sendEmailVerification(cred.user);
      setEmailVerificationRequired(true);
    }
  };

  const handleResetPassword = async (email: string) => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      throw new Error('Enter your email address first so we can send a password reset link.');
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  };

  const handleResendVerificationEmail = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('Please sign in first.');
    }
    await sendEmailVerification(fbUser);
  };

  const handleCheckVerification = async (): Promise<boolean> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return false;
    await fbUser.reload();
    if (fbUser.emailVerified) {
      const token = await fbUser.getIdToken(true);
      setCurrentUser(fbUser);
      setIdToken(token);
      setEmailVerificationRequired(false);
      await loadVerifiedUserOverview(fbUser);
      return true;
    }
    return false;
  };

  const handleSignOut = async () => {
    localStorage.removeItem(LEGACY_SESSION_KEY);
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Firebase signout skipped:', err);
    }
    setCurrentUser(null);
    setOfflineUserScope(null);
    setIdToken(null);
    setEmailVerificationRequired(false);
    setUserOverview(null);
    setServiceError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        idToken,
        loading,
        emailVerificationRequired,
        serviceError,
        userOverview,
        refreshOverview,
        signInWithGoogle: handleSignInWithGoogle,
        signInWithEmail: handleSignInWithEmail,
        signUpWithEmail: handleSignUpWithEmail,
        resetPassword: handleResetPassword,
        resendVerificationEmail: handleResendVerificationEmail,
        checkVerification: handleCheckVerification,
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
