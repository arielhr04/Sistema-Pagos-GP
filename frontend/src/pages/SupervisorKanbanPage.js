import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import InvoiceDownloadActions from '../components/InvoiceDownloadActions';
import { parseDateOnly } from '../lib/date';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Building2,
  FileText,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLORS = {
  'Capturada': 'bg-zinc-100 text-zinc-800',
  'En revisión': 'bg-yellow-100 text-yellow-800',
  'Programada': 'bg-blue-100 text-blue-800',
  'Pendiente Autorización': 'bg-orange-100 text-orange-800',
  'Pagada': 'bg-green-100 text-green-800',
  'Rechazada': 'bg-red-100 text-red-800',
};

const getTrafficLight = (fechaVencimiento) => {
  if (!fechaVencimiento) return { color: 'bg-zinc-400', label: 'Sin fecha' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = parseDateOnly(fechaVencimiento);
  if (!dueDate) return { color: 'bg-zinc-400', label: 'Sin fecha' };
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { color: 'bg-red-500', label: 'Vencida' };
  if (diffDays <= 3) return { color: 'bg-red-400', label: `${diffDays}d` };
  if (diffDays <= 7) return { color: 'bg-yellow-400', label: `${diffDays}d` };
  return { color: 'bg-green-400', label: `${diffDays}d` };
};

const formatCurrency = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);

const InvoiceCard = ({ invoice, onClick }) => {
  const traffic = getTrafficLight(invoice.fecha_vencimiento);
  const canApprove =
    invoice.requiere_autorizacion && !invoice.aprobada_por_supervisor;

  return (
    <div
      className="bg-white border border-zinc-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(invoice)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-zinc-800 truncate flex-1">
          {invoice.nombre_proveedor}
        </p>
        <span
          className={`flex-shrink-0 w-3 h-3 rounded-full mt-0.5 ${traffic.color}`}
          title={`Vence en ${traffic.label}`}
        />
      </div>

      <p className="text-xs text-zinc-500 mb-2 truncate">{invoice.folio_fiscal}</p>

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-900">
          {formatCurrency(invoice.monto)}
        </span>
        <Badge className={`text-xs ${STATUS_COLORS[invoice.estatus] || 'bg-zinc-100 text-zinc-800'}`}>
          {invoice.estatus}
        </Badge>
      </div>

      {canApprove && (
        <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center gap-1 text-orange-600">
          <AlertTriangle className="w-3 h-3" />
          <span className="text-xs font-medium">Requiere aprobación</span>
        </div>
      )}
    </div>
  );
};

const EmpresaColumn = ({ empresa, invoices, onCardClick }) => {
  const pendingInvoices = invoices.filter(
    (inv) => inv.requiere_autorizacion && !inv.aprobada_por_supervisor
  );

  return (
    <div className="flex-shrink-0 w-72">
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden">
        {/* Column Header */}
        <div className="bg-white border-b border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-zinc-500" />
            <h3 className="font-bold text-sm text-zinc-800 truncate">{empresa.nombre}</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{pendingInvoices.length} factura{pendingInvoices.length !== 1 ? 's' : ''}</span>
            {pendingInvoices.length > 0 && (
              <Badge className="bg-orange-100 text-orange-700 text-xs">
                {pendingInvoices.length} pendiente{pendingInvoices.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Cards */}
        <div className="p-3 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
          {pendingInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
              <FileText className="w-8 h-8 mb-2" />
              <p className="text-xs">Sin pendientes</p>
            </div>
          ) : (
            pendingInvoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} onClick={onCardClick} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const SupervisorKanbanPage = () => {
  const { user, token, getAuthHeader } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [invoicesByEmpresa, setInvoicesByEmpresa] = useState({});
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const empRes = await axios.get(`${API_URL}/api/areas/mis-empresas`, getAuthHeader());
      const myEmpresas = empRes.data;
      setEmpresas(myEmpresas);

      // Obtener solo pendientes de autorización y agrupar por empresa.
      const pendingRes = await axios.get(
        `${API_URL}/api/invoices/supervisor/pending?limit=200`,
        getAuthHeader()
      );
      const pendingItems = pendingRes.data || [];

      const map = {};
      myEmpresas.forEach((emp) => {
        map[emp.id] = [];
      });

      pendingItems.forEach((inv) => {
        if (map[inv.empresa_factura]) {
          map[inv.empresa_factura].push(inv);
        }
      });

      Object.keys(map).forEach((empresaId) => {
        map[empresaId].sort(
          (a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento)
        );
      });

      setInvoicesByEmpresa(map);
    } catch (error) {
      console.error('Error fetching supervisor kanban data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async () => {
    if (!selectedInvoice) return;
    setApproving(true);
    try {
      await axios.post(
        `${API_URL}/api/invoices/${selectedInvoice.id}/supervisor/approve`,
        {},
        getAuthHeader()
      );
      toast.success('Factura aprobada exitosamente');
      setDetailOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error) {
      console.error('Error approving invoice:', error);
      toast.error(error.response?.data?.detail || 'Error al aprobar la factura');
    } finally {
      setApproving(false);
    }
  };

  const handleCardClick = (invoice) => {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  };

  const handleDownload = useCallback(async (url, fileName) => {
    try {
      const response = await fetch(`${API_URL}${url}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('No se pudo descargar el archivo');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      toast.error(error.message || 'Error al descargar archivo');
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            Panel de Empresas
          </h1>
          <p className="text-zinc-500 mt-1">
            Facturas activas por empresa supervisada
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      {/* Kanban Board */}
      {empresas.length === 0 ? (
        <Card className="bg-white border border-zinc-200">
          <CardContent className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Building2 className="w-12 h-12 mb-4 text-zinc-300" />
            <p className="font-medium">No tienes empresas asignadas</p>
            <p className="text-sm">Contacta al administrador para que te asigne empresas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {empresas.map((empresa) => (
              <EmpresaColumn
                key={empresa.id}
                empresa={empresa}
                invoices={invoicesByEmpresa[empresa.id] || []}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-[Chivo]">
              Detalle de Factura
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.nombre_proveedor}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Proveedor</p>
                  <p className="font-semibold">{selectedInvoice.nombre_proveedor}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Folio Fiscal</p>
                  <p className="font-semibold">{selectedInvoice.folio_fiscal}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Monto</p>
                  <p className="font-bold text-lg">{formatCurrency(selectedInvoice.monto)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Vencimiento</p>
                  <p className="font-semibold">{selectedInvoice.fecha_vencimiento}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Empresa</p>
                  <p className="font-semibold">{selectedInvoice.empresa_nombre}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Estatus</p>
                  <Badge className={STATUS_COLORS[selectedInvoice.estatus] || 'bg-zinc-100 text-zinc-800'}>
                    {selectedInvoice.estatus}
                  </Badge>
                </div>
                {selectedInvoice.descripcion_factura && (
                  <div className="col-span-2">
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Descripción</p>
                    <p className="text-zinc-700">{selectedInvoice.descripcion_factura}</p>
                  </div>
                )}
              </div>

              {/* Approval status */}
              {selectedInvoice.requiere_autorizacion && (
                <div
                  className={`p-3 rounded-lg border text-sm ${
                    selectedInvoice.aprobada_por_supervisor
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-orange-50 border-orange-200 text-orange-800'
                  }`}
                >
                  {selectedInvoice.aprobada_por_supervisor ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Aprobada por supervisor el {selectedInvoice.fecha_aprobacion_supervisor}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Esta factura requiere tu aprobación</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <InvoiceDownloadActions
                  invoiceId={selectedInvoice.id}
                  folioFiscal={selectedInvoice.folio_fiscal}
                  isPaid={selectedInvoice.estatus === 'Pagada'}
                  onDownload={handleDownload}
                />
                {selectedInvoice.requiere_autorizacion &&
                  !selectedInvoice.aprobada_por_supervisor && (
                    <Button
                      onClick={handleApprove}
                      disabled={approving}
                      className="bg-green-600 hover:bg-green-700 text-white gap-2"
                    >
                      {approving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {approving ? 'Aprobando...' : 'Aprobar Factura'}
                    </Button>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupervisorKanbanPage;
