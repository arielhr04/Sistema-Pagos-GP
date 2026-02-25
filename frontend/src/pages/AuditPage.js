import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { History, ArrowRight, FileText, User } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700',
  'En revisión': 'bg-yellow-100 text-yellow-700',
  'Programada': 'bg-blue-100 text-blue-700',
  'Pagada': 'bg-green-100 text-green-700',
  'Rechazada': 'bg-red-100 text-red-700',
  '': 'bg-zinc-50 text-zinc-400',
};

const AuditPage = () => {
  const { getAuthHeader } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/audit?limit=200`, getAuthHeader());
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Error al cargar logs de auditoría');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="audit-page">
      <div>
        <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
          Logs de Auditoría
        </h1>
        <p className="text-zinc-500 mt-1">Historial de cambios de estatus en facturas</p>
      </div>

      <Card className="bg-white border border-zinc-200">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            Historial de Movimientos
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
              <p className="font-medium">No hay registros de auditoría</p>
              <p className="text-sm">Los cambios de estatus aparecerán aquí</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold">Fecha</TableHead>
                    <TableHead className="font-bold">Folio Fiscal</TableHead>
                    <TableHead className="font-bold">Usuario</TableHead>
                    <TableHead className="font-bold text-center">Cambio de Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-zinc-50">
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
