import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  dismissAll,
  type AppNotification,
} from '../services/notificationService';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAllNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markRead: async () => {},
  markAllRead: async () => {},
  dismiss: async () => {},
  dismissAllNotifications: async () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

interface NotificationProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications(60);
      setNotifications(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    channelRef.current = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notification',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((prev) => [n, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notification',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) =>
            updated.is_dismissed
              ? prev.filter((n) => n.notification_id !== updated.notification_id)
              : prev.map((n) => n.notification_id === updated.notification_id ? updated : n)
          );
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, load]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => n.notification_id === id ? { ...n, is_read: true } : n)
    );
    await markAsRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllAsRead();
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
    await dismissNotification(id);
  }, []);

  const dismissAllNotifications = useCallback(async () => {
    setNotifications([]);
    await dismissAll();
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      markRead,
      markAllRead,
      dismiss,
      dismissAllNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
