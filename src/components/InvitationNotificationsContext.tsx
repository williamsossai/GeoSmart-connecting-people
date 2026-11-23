import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.tsx';

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
  const { idToken } = useAuth();
  const [state, setState] = useState<InvitationNotificationState>(defaultState);

  const refreshInvitationNotifications = useCallback(async () => {
    if (!idToken) {
      setState(defaultState);
      return;
    }
    try {
      const response = await fetch('/api/family/invitation-notifications', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setState({
        pendingCount: Number(data.pendingCount || 0),
        hasUnreadActivity: Boolean(data.hasUnreadActivity),
        alertsEnabled: Boolean(data.alertsEnabled),
      });
    } catch (error) {
      console.error('Failed to refresh invitation notifications:', error);
    }
  }, [idToken]);

  useEffect(() => {
    void refreshInvitationNotifications();
    if (!idToken) return;
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
  }, [idToken, refreshInvitationNotifications]);

  const markInvitationActivityRead = useCallback(async () => {
    if (!idToken) return;
    try {
      const response = await fetch('/api/family/invitation-notifications/read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error('Failed to clear invitation activity.');
      const data = await response.json();
      setState((current) => ({ ...current, ...data }));
    } catch (error) {
      console.error('Failed to clear invitation activity:', error);
    }
  }, [idToken]);

  const updateInvitationAlerts = useCallback(async (enabled: boolean) => {
    if (!idToken) throw new Error('Sign in to update invitation alerts.');
    const response = await fetch('/api/family/invitation-notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ alertsEnabled: enabled }),
    });
    if (!response.ok) throw new Error('Failed to update invitation alerts.');
    const data = await response.json();
    setState((current) => ({ ...current, ...data }));
  }, [idToken]);

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
