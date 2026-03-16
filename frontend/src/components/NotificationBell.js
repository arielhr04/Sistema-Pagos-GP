import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Bell } from 'lucide-react';
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const lastSeenRef = useRef(localStorage.getItem('notif_last_seen') || '');

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
      const items = response.data?.items || [];
      setNotifications(items);
      setUnreadCount(items.length);
    } catch {
      // Silenciar errores de polling
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleOpen = (isOpen) => {
    setOpen(isOpen);
    if (isOpen && notifications.length > 0) {
      // Marcar como vistas: guardar el timestamp más reciente
      const latest = notifications[0]?.fecha;
      if (latest) {
        lastSeenRef.current = latest;
        localStorage.setItem('notif_last_seen', latest);
      }
      setUnreadCount(0);
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2">
          <Bell className="w-5 h-5 text-zinc-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-zinc-100">
          <h4 className="font-semibold text-sm">Notificaciones</h4>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">
              Sin notificaciones recientes
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="px-3 py-2.5 border-b border-zinc-50 hover:bg-zinc-50 last:border-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">
                      {n.folio_fiscal || 'Factura'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {n.usuario_nombre} cambió de{' '}
                      <span className="font-medium">{n.estatus_anterior || '—'}</span>
                      {' → '}
                      <span className="font-medium">{n.estatus_nuevo}</span>
                    </p>
                    {n.proveedor && (
                      <p className="text-xs text-zinc-400 truncate">{n.proveedor}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 whitespace-nowrap mt-0.5">
                    {formatTime(n.fecha)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
