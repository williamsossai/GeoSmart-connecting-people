import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  getFamilyInvitationNotificationStateFs,
  markFamilyInvitationActivityReadFs,
  setFamilyInvitationAlertsEnabledFs,
} from '../lib/firestore-repo.ts';

interface InvitationNotificationState {
  pendingCount: number;
  hasUnreadActivity: boolean;
  alertsEnabled: boolean;
}

interface InvitationNotificationsContextValue extends InvitationNotificationState {
  refreshInvitationNotifications: () => Promise<void>;
  markInvitationActivityRead: () => Promise<void>;
  updateInvitationAlerts: (enabled: boolean) => Promise<void>;
}

const defaultState: InvitationNotificationState = {
  pendingCount: 0,
  hasUnreadActivity: false,
  alertsEnabled: true,
};

const InvitationNotificationsContext = createContext<InvitationNotificationsContextValue | null>(null);
export const INVITATION_NOTIFICATIONS_CHANGED = 'geosmart:invitation-notifications-changed';

export const notifyInvitationNotificationsChanged = () => {
  window.dispatchEvent(new Event(INVITATION_NOTIFICATIONS_CHANGED));
};

export const InvitationNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, emailVerificationRequired } = useAuth();
  const [state, setState] = useState<InvitationNotificationState>(defaultState);

  const isVerifiedReady = Boolean(currentUser?.uid && !emailVerificationRequired);

  const refreshInvitationNotifications = useCallback(async () => {
    if (!currentUser?.uid || emailVerificationRequired) {
      setState(defaultState);
      return;
    }
    try {
      const data = await getFamilyInvitationNotificationStateFs(currentUser.uid);
      setState({
        pendingCount: Number(data.pendingCount || 0),
        hasUnreadActivity: Boolean(data.hasUnreadActivity),
        alertsEnabled: Boolean(data.alertsEnabled),
      });
    } catch (error) {
      console.error('Failed to refresh invitation notifications:', error);
    }
  }, [currentUser?.uid, emailVerificationRequired]);

  useEffect(() => {
    void refreshInvitationNotifications();
    if (!isVerifiedReady) return;
    const intervalId = window.setInterval(() => void refreshInvitationNotifications(), 30_000);
    const onFocus = () => void refreshInvitationNotifications();
    const onChanged = () => void refreshInvitationNotifications();
    window.addEventListener('focus', onFocus);
    window.addEventListener(INVITATION_NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(INVITATION_NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [isVerifiedReady, refreshInvitationNotifications]);

  const markInvitationActivityRead = useCallback(async () => {
    if (!currentUser?.uid || emailVerificationRequired) return;
    try {
      await markFamilyInvitationActivityReadFs(currentUser.uid);
      setState((current) => ({ ...current, hasUnreadActivity: false }));
    } catch (error) {
      console.error('Failed to clear invitation activity:', error);
    }
  }, [currentUser?.uid, emailVerificationRequired]);

  const updateInvitationAlerts = useCallback(async (enabled: boolean) => {
    if (!currentUser?.uid || emailVerificationRequired) {
      throw new Error('Sign in with a verified email to update invitation alerts.');
    }
    await setFamilyInvitationAlertsEnabledFs(currentUser.uid, enabled);
    setState((current) => ({ ...current, alertsEnabled: enabled }));
  }, [currentUser?.uid, emailVerificationRequired]);

  return (
    <InvitationNotificationsContext.Provider value={{
      ...state,
      refreshInvitationNotifications,
      markInvitationActivityRead,
      updateInvitationAlerts,
    }}>
      {children}
    </InvitationNotificationsContext.Provider>
  );
};

export const useInvitationNotifications = () => {
  const context = useContext(InvitationNotificationsContext);
  if (!context) throw new Error('useInvitationNotifications must be used within InvitationNotificationsProvider.');
  return context;
};
