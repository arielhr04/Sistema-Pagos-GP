import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Bell, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const POLL_INTERVAL_MS = 30_000; // 30 segundos

const NotificationBell = () => {
  const { getAuthHeader } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const lastSeenRef = useRef(localStorage.getItem('notif_last_seen') || '');
  const dismissedRef = useRef(new Set(JSON.parse(localStorage.getItem('notif_dismissed') || '[]')));

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (lastSeenRef.current) {
        params.append('since', lastSeenRef.current);
      }
      const response = await axios.get(
        `${API_URL}/api/notifications?${params.toString()}`,
        getAuthHeader()
      );
      const items = (response.data?.items || []).filter(
        (n) => !dismissedRef.current.has(n.id)
      );
      setNotifications(items);
    } catch {
      // Silenciar errores de polling
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const dismissNotification = (id) => {
    dismissedRef.current.add(id);
    localStorage.setItem(
      'notif_dismissed',
      JSON.stringify([...dismissedRef.current])
    );
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const dismissAll = () => {
    notifications.forEach((n) => dismissedRef.current.add(n.id));
    localStorage.setItem(
      'notif_dismissed',
      JSON.stringify([...dismissedRef.current])
    );
    setNotifications([]);
  };

  const handleOpen = (isOpen) => {
    setOpen(isOpen);
    if (isOpen && notifications.length > 0) {
      const latest = notifications[0]?.fecha;
      if (latest) {
        lastSeenRef.current = latest;
        localStorage.setItem('notif_last_seen', latest);
      }
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2" data-tour="notifications">
          <Bell className="w-5 h-5 text-zinc-600" />
          {notifications.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Notificaciones</span>
          {notifications.length > 0 && (
            <button
              onClick={dismissAll}
              className="text-[10px] text-zinc-400 hover:text-red-600 transition-colors"
            >
              Limpiar todo
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              Sin notificaciones
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="group flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700 leading-snug">
                      <span className="font-medium">{n.usuario_nombre}</span>
                      {' · '}
                      <span className="text-zinc-400">{n.estatus_anterior || '—'}</span>
                      {' → '}
                      <span className="font-medium">{n.estatus_nuevo}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                      {n.folio_fiscal}
                      {n.proveedor ? ` · ${n.proveedor}` : ''}
                      {' · '}
                      {formatTime(n.fecha)}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissNotification(n.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-300 hover:text-zinc-600 transition-all"
                    title="Descartar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
