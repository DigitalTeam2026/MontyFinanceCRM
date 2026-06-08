import { useEffect, useRef } from 'react';
import {
  Bell, CheckCheck, Trash2, X, UserCheck, AtSign, Zap, Loader2,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import type { AppNotification, NotificationType } from '../services/notificationService';
import type { AppEntity, AppModule } from '../types';

const ENTITY_MODULE: Record<string, { module: AppModule; entity: AppEntity }> = {
  account:     { module: 'sales',   entity: 'accounts' },
  contact:     { module: 'sales',   entity: 'contacts' },
  lead:        { module: 'sales',   entity: 'leads' },
  opportunity: { module: 'sales',   entity: 'opportunities' },
  ticket:      { module: 'support', entity: 'tickets' },
};

function typeIcon(type: NotificationType) {
  if (type === 'assignment')    return <UserCheck size={13} className="text-blue-500" />;
  if (type === 'mention')       return <AtSign size={13} className="text-emerald-500" />;
  if (type === 'workflow_alert') return <Zap size={13} className="text-amber-500" />;
  return <Bell size={13} className="text-slate-400" />;
}

function typeBadgeClass(type: NotificationType) {
  if (type === 'assignment')    return 'bg-blue-50 text-blue-600';
  if (type === 'mention')       return 'bg-emerald-50 text-emerald-600';
  if (type === 'workflow_alert') return 'bg-amber-50 text-amber-600';
  return 'bg-slate-50 text-slate-500';
}

function typeLabel(type: NotificationType) {
  if (type === 'assignment')    return 'Assigned';
  if (type === 'mention')       return 'Mentioned';
  if (type === 'workflow_alert') return 'Workflow';
  return '';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface NotificationItemProps {
  n: AppNotification;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
  onNavigate: (module: AppModule, entity: AppEntity, id: string) => void;
}

function NotificationItem({ n, onDismiss, onRead, onNavigate }: NotificationItemProps) {
  const ctx = n.entity_name ? ENTITY_MODULE[n.entity_name] : null;

  const handleClick = () => {
    if (!n.is_read) onRead(n.notification_id);
    if (ctx && n.record_id) {
      onNavigate(ctx.module, ctx.entity, n.record_id);
    }
  };

  return (
    <div
      className={`group relative flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-slate-50 ${
        !n.is_read ? 'bg-blue-50/40' : ''
      }`}
      onClick={handleClick}
    >
      {!n.is_read && (
        <span className="absolute left-1.5 top-4 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
      )}

      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${typeBadgeClass(n.type)}`}>
        {typeIcon(n.type)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[12.5px] leading-snug ${n.is_read ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
            {n.title}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(n.notification_id); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-slate-500 transition shrink-0 mt-0.5"
            title="Dismiss"
          >
            <X size={11} />
          </button>
        </div>

        {n.body && (
          <p className="text-[11.5px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">{n.body}</p>
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeBadgeClass(n.type)}`}>
            {typeIcon(n.type)}
            {typeLabel(n.type)}
          </span>
          <span className="text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

interface NotificationPanelProps {
  onClose: () => void;
  onNavigate: (module: AppModule, entity: AppEntity, id: string) => void;
}

export default function NotificationPanel({ onClose, onNavigate }: NotificationPanelProps) {
  const { notifications, unreadCount, loading, markRead, markAllRead, dismiss, dismissAllNotifications } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl border border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 80px)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-slate-500" />
          <span className="text-[13px] font-semibold text-slate-800">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-blue-500 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              title="Mark all as read"
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md transition"
            >
              <CheckCheck size={11} />
              <span className="hidden sm:inline">Mark all read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={dismissAllNotifications}
              title="Clear all"
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition"
            >
              <Trash2 size={11} />
              <span className="hidden sm:inline">Clear all</span>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Bell size={16} className="text-slate-400" />
            </div>
            <p className="text-[13px] font-medium text-slate-600">All caught up</p>
            <p className="text-[11.5px] text-slate-400 mt-1">No new notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.notification_id}
              n={n}
              onDismiss={dismiss}
              onRead={markRead}
              onNavigate={(module, entity, id) => {
                onNavigate(module, entity, id);
                onClose();
              }}
            />
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 shrink-0">
          <p className="text-[11px] text-slate-400 text-center">
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            {unreadCount > 0 ? ` · ${unreadCount} unread` : ' · all read'}
          </p>
        </div>
      )}
    </div>
  );
}
