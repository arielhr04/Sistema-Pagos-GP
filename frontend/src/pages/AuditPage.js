import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { buildCacheKey, readApiCache, writeApiCache } from '../lib/apiCache';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { History, ArrowRight, FileText, User, LogIn, LogOut } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const CACHE_TTL_AUDIT_MS = 60 * 1000;
const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700',
  'En revisión': 'bg-yellow-100 text-yellow-700',
  'Programada': 'bg-blue-100 text-blue-700',
  'Pagada': 'bg-green-100 text-green-700',
  'Rechazada': 'bg-red-100 text-red-700',
  'Sin revisión de tesorería': 'bg-zinc-100 text-zinc-700',
  'Revisada por tesorería': 'bg-green-100 text-green-700',
  '': 'bg-zinc-50 text-zinc-400',
};

const LOGIN_EVENT_STYLES = {
  'login_exitoso': 'bg-green-100 text-green-700',
  'login_fallido': 'bg-red-100 text-red-700',
  'logout': 'bg-gray-100 text-gray-700',
  'cambio_password': 'bg-blue-100 text-blue-700',
};

const LOGIN_EVENT_LABELS = {
  'login_exitoso': 'Login Exitoso',
  'login_fallido': 'Login Fallido',
  'logout': 'Cierre de Sesión',
  'cambio_password': 'Cambio de Contraseña',
};

const AuditPage = () => {
  const { getAuthHeader, user } = useAuth();
  const { demoMode, demoData } = useTour();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logType, setLogType] = useState('facturas');

  const fetchLogs = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const mockLogs = logType === 'facturas' 
          ? demoData.auditLogs || []
          : demoData.loginLogs || [];
        setLogs(mockLogs);
        setLoading(false);
        return;
      } catch (error) {
        console.error(`Error loading demo logs:`, error);
        setLoading(false);
        return;
      }
    }

    // Modo normal: usar API
    const cacheKey = buildCacheKey(`audit-logs-${logType}`, user?.id || user?.email || 'anon');
    const cachedLogs = readApiCache(cacheKey, CACHE_TTL_AUDIT_MS);
    const hasCachedLogs = Array.isArray(cachedLogs);

    if (hasCachedLogs) {
      setLogs(cachedLogs);
      setLoading(false);
    }

    try {
      const endpoint = logType === 'facturas' 
        ? `${API_URL}/api/audit?limit=200`
        : `${API_URL}/api/audit/login?limit=200`;
      
      const response = await axios.get(endpoint, getAuthHeader());
      setLogs(response.data);
      writeApiCache(cacheKey, response.data);
    } catch (error) {
      console.error(`Error fetching ${logType} logs:`, error);
      if (!hasCachedLogs) {
        toast.error(`Error al cargar logs de ${logType === 'facturas' ? 'facturas' : 'login'}`);
      }
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, user?.id, user?.email, logType, demoMode, demoData]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: CLIENT_TIMEZONE,
    }).format(date);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="audit-page">
      <div>
        <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
          Logs de Auditoría
        </h1>
        <p className="text-zinc-500 mt-1">Historial de cambios de estatus y eventos de seguridad</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-200">
        <Button
          variant={logType === 'facturas' ? 'default' : 'ghost'}
          className={logType === 'facturas' ? 'bg-red-600 hover:bg-red-700' : 'text-zinc-600'}
          onClick={() => {
            setLogType('facturas');
            setLoading(true);
          }}
        >
          <FileText className="w-4 h-4 mr-2" />
          Logs de Facturas
        </Button>
        <Button
          variant={logType === 'login' ? 'default' : 'ghost'}
          className={logType === 'login' ? 'bg-red-600 hover:bg-red-700' : 'text-zinc-600'}
          onClick={() => {
            setLogType('login');
            setLoading(true);
          }}
        >
          <LogIn className="w-4 h-4 mr-2" />
          Logs de Login
        </Button>
      </div>

      <Card className="bg-white border border-zinc-200" data-tour="audit-table">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            {logType === 'facturas' ? 'Historial de Movimientos de Facturas' : 'Historial de Eventos de Login'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <History className="w-12 h-12 mb-4 text-zinc-300" />
              <p className="font-medium">No hay registros</p>
              <p className="text-sm">{logType === 'facturas' ? 'Los cambios de estatus aparecerán aquí' : 'Los eventos de login aparecerán aquí'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold">Fecha</TableHead>
                    {logType === 'facturas' && (
                      <>
                        <TableHead className="font-bold">Folio Fiscal</TableHead>
                        <TableHead className="font-bold">Usuario</TableHead>
                        <TableHead className="font-bold text-center">Evento</TableHead>
                      </>
                    )}
                    {logType === 'login' && (
                      <>
                        <TableHead className="font-bold">Email/Usuario</TableHead>
                        <TableHead className="font-bold">Evento</TableHead>
                        <TableHead className="font-bold">Razón</TableHead>
                        <TableHead className="font-bold">IP/User-Agent</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-zinc-50">
                      {logType === 'facturas' && (
                        <>
                          <TableCell className="text-sm text-zinc-600">
                            {formatDate(log.fecha_cambio)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-zinc-400" />
                              <span className="font-mono text-sm">{log.folio_fiscal || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-zinc-400" />
                              <span className="font-medium text-sm">{log.usuario_nombre || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Badge variant="outline" className={STATUS_STYLES[log.estatus_anterior] || STATUS_STYLES['']}>
                                {log.estatus_anterior || 'Nuevo'}
                              </Badge>
                              <ArrowRight className="w-4 h-4 text-zinc-400" />
                              <Badge variant="outline" className={STATUS_STYLES[log.estatus_nuevo]}>
                                {log.estatus_nuevo}
                              </Badge>
                            </div>
                          </TableCell>
                        </>
                      )}
                      {logType === 'login' && (
                        <>
                          <TableCell className="text-sm text-zinc-600">
                            {formatDate(log.fecha)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {log.evento_tipo === 'login_exitoso' && <LogIn className="w-4 h-4 text-green-600" />}
                              {log.evento_tipo === 'login_fallido' && <LogIn className="w-4 h-4 text-red-600" />}
                              {log.evento_tipo === 'logout' && <LogOut className="w-4 h-4 text-gray-600" />}
                              <span className="font-medium text-sm">{log.email_intentado || log.usuario_nombre || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={LOGIN_EVENT_STYLES[log.evento_tipo]}>
                              {LOGIN_EVENT_LABELS[log.evento_tipo]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-zinc-600">{log.razon || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-zinc-600">
                              <div>{log.ip_address}</div>
                              <div className="truncate max-w-xs">{log.user_agent}</div>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditPage;
