import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '../components/ui/dialog';
import { 
  Search, 
  FileText, 
  Filter,
  X,
  History,
  Download,
  Upload,
  Calendar as CalendarIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'En revisión': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Programada': 'bg-blue-100 text-blue-700 border-blue-200',
  'Pagada': 'bg-green-100 text-green-700 border-green-200',
  'Rechazada': 'bg-red-100 text-red-700 border-red-200',
};

const InvoicesPage = () => {
  const { getAuthHeader, token, user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentDate, setPaymentDate] = useState(null);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('estatus', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      
      const response = await axios.get(
        `${API_URL}/api/invoices?${params.toString()}`,
        getAuthHeader()
      );
      setInvoices(response.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, areaFilter, getAuthHeader]);

  const fetchAreas = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      setAreas(response.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchInvoices]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setAreaFilter('');
  };

  const handleInvoiceClick = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentDate(invoice.fecha_pago_real ? new Date(invoice.fecha_pago_real) : null);
    setPaymentProofFile(null);
    setDialogOpen(true);
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedInvoice) return;

    setUpdating(true);
    try {
      const response = await axios.put(
        `${API_URL}/api/invoices/${selectedInvoice.id}/status`,
        { nuevo_estatus: newStatus, fecha_pago_real: paymentDate ? paymentDate.toISOString().slice(0, 10) : null },
        getAuthHeader()
      );
      setSelectedInvoice(response.data);
      fetchInvoices();
      toast.success('Estatus actualizado');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.response?.data?.detail || 'Error al actualizar estatus');
    } finally {
      setUpdating(false);
    }
  };

  const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

  const isValidPdfFile = (file) => {
    if (!file) return false;
    const fileName = (file.name || '').toLowerCase();
    return file.type === 'application/pdf' || fileName.endsWith('.pdf');
  };

  const getDroppedFile = (e) => e.dataTransfer?.files?.[0] || null;

  const preventDragDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleProofFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!isValidPdfFile(file)) {
      toast.error('Solo se permiten archivos PDF');
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error('El archivo no puede superar 10MB');
      return;
    }

    setPaymentProofFile(file);
    if (!selectedInvoice) return;
    setUpdating(true);
    try {
      const formData = new FormData();
      formData.append('proof_file', file);
      const response = await axios.post(
        `${API_URL}/api/invoices/${selectedInvoice.id}/payment-proof`,
        formData,
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data' 
          } 
        }
      );
      setSelectedInvoice(response.data);
      fetchInvoices();
      toast.success('Comprobante subido y factura marcada como Pagada');
    } catch (error) {
      console.error('Error uploading proof:', error);
      toast.error(error.response?.data?.detail || 'Error al subir comprobante');
    } finally {
      setUpdating(false);
    }
  };

  const handleDragOver = (e) => {
    preventDragDefaults(e);
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    preventDragDefaults(e);
    // Solo resetear si realmente salimos del contenedor
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    preventDragDefaults(e);
    setIsDragging(false);
    const file = getDroppedFile(e);
    if (file) {
      if (!isValidPdfFile(file)) {
        toast.error('Solo se permiten archivos PDF');
        return;
      }
      if (file.size > MAX_PDF_SIZE_BYTES) {
        toast.error('El archivo no puede superar 10MB');
        return;
      }
      // Trigger the same handler as file input
      handleProofFileChange({ target: { files: [file] } });
    }
  };

  const downloadFile = async (url, filename) => {
    try {
      const response = await axios.get(`${API_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      
      // Extract filename from URL
      const urlParts = url.split('/');
      const serverFilename = urlParts[urlParts.length - 1];
      
      const downloadUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = serverFilename || filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Archivo descargado');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Error al descargar archivo');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('estatus', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      const response = await axios.get(`${API_URL}/api/invoices/export/excel?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facturas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Archivo exportado');
    } catch (error) {
      console.error('Error exporting invoices:', error);
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    return dateString ? dateString.slice(0, 10) : '-';
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="invoices-page">
      <div>
        <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
          Histórico de Facturas
        </h1>
        <p className="text-zinc-500 mt-1">Consulta el registro de todas las facturas del sistema</p>
      </div>

      {/* Filters */}
      <Card className="bg-white border border-zinc-200">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Buscar por proveedor, folio o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="invoice-search-input"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="status-filter-select">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Capturada">Capturada</SelectItem>
                <SelectItem value="En revisión">En revisión</SelectItem>
                <SelectItem value="Programada">Programada</SelectItem>
                <SelectItem value="Pagada">Pagada</SelectItem>
                <SelectItem value="Rechazada">Rechazada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="area-filter-select">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleExportExcel}
              disabled={exporting}
              data-testid="export-excel-btn"
            >
              {exporting ? 'Exportando...' : 'Exportar Excel'}
            </Button>

            {(searchTerm || statusFilter || areaFilter) && (
              <Button variant="ghost" onClick={clearFilters} className="px-3">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card className="bg-white border border-zinc-200">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            Registro de Facturas
            <Badge variant="secondary" className="ml-2 font-mono">
              {invoices.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <FileText className="w-12 h-12 mb-4 text-zinc-300" />
              <p className="font-medium">No se encontraron facturas</p>
              <p className="text-sm">No hay registros con los filtros aplicados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold w-20">ID</TableHead>
                    <TableHead className="font-bold">Folio Fiscal</TableHead>
                    <TableHead className="font-bold">Proveedor</TableHead>
                    <TableHead className="font-bold">Fecha Vencimiento</TableHead>
                    <TableHead className="font-bold">Fecha Registro</TableHead>
                    <TableHead className="font-bold text-center">Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice, index) => (
                    <TableRow 
                      key={invoice.id} 
                      onClick={() => handleInvoiceClick(invoice)}
                      className="hover:bg-zinc-50 cursor-pointer"
                    >
                      <TableCell className="font-mono text-sm text-zinc-500">
                        #{index + 1}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {invoice.folio_fiscal}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900">
                        {invoice.nombre_proveedor}
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {formatDate(invoice.fecha_vencimiento)}
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {formatDate(invoice.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={STATUS_STYLES[invoice.estatus]}
                        >
                          {invoice.estatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Chivo]">
              Detalle de Factura
            </DialogTitle>
            <DialogDescription>
              Información completa y gestión de la factura.
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-lg">
                <div>
                  <p className="text-xs text-zinc-500">Folio Fiscal</p>
                  <p className="font-mono font-medium text-sm">{selectedInvoice.folio_fiscal}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Monto</p>
                  <p className="font-mono font-bold">{formatCurrency(selectedInvoice.monto)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Proveedor</p>
                  <p className="font-medium text-sm">{selectedInvoice.nombre_proveedor}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Vencimiento</p>
                  <p className="font-medium text-sm">{selectedInvoice.fecha_vencimiento.slice(0, 10)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500">Descripción</p>
                  <p className="text-sm">{selectedInvoice.descripcion_factura}</p>
                </div>
              </div>

              {(user?.rol === 'Administrador' || user?.rol === 'Tesorero') && (
                <>
                  <div className="space-y-2">
                    <Label>Cambiar Estatus</Label>
                    <Select
                      key={`status-${selectedInvoice.estatus}`}
                      value={selectedInvoice.estatus}
                      onValueChange={handleStatusChange}
                      disabled={updating}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Capturada">Capturada</SelectItem>
                        <SelectItem value="En revisión">En revisión</SelectItem>
                        <SelectItem value="Programada">Programada</SelectItem>
                        <SelectItem value="Pagada">Pagada</SelectItem>
                        <SelectItem value="Rechazada">Rechazada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedInvoice.estatus !== 'Pagada' && (
                    <>
                      <div className="space-y-2">
                        <Label>Fecha Real de Pago (opcional)</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {paymentDate ? format(paymentDate, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={paymentDate}
                              onSelect={setPaymentDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label>Comprobante de Pago (PDF)</Label>
                        <div 
                          className={`border-2 border-dashed rounded-lg p-4 text-center ${
                            paymentProofFile ? 'border-green-500 bg-green-50' : 
                            isDragging ? 'border-red-500 bg-red-50' : 
                            'border-zinc-300'
                          }`}
                          onDragEnter={handleDragOver}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleProofFileChange}
                            className="hidden"
                            id="proof-upload-invoices"
                          />
                          <label htmlFor="proof-upload-invoices" className="cursor-pointer" style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
                            {paymentProofFile ? (
                              <div className="flex items-center justify-center gap-2 text-green-700">
                                <FileText className="w-5 h-5" />
                                <span className="text-sm">{paymentProofFile.name}</span>
                              </div>
                            ) : (
                              <div className="text-zinc-500">
                                <Upload className="w-6 h-6 mx-auto mb-1" />
                                <p className="text-sm">Arrastra aquí el comprobante o haz clic para seleccionar</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <Button
                onClick={() => downloadFile(`/api/invoices/${selectedInvoice.id}/download-pdf`, `FACGP_${selectedInvoice.folio_fiscal}.pdf`)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF de Factura
              </Button>

              {selectedInvoice.estatus === 'Pagada' && (
                <Button
                  onClick={() => downloadFile(`/api/invoices/${selectedInvoice.id}/download-proof`, `PAGP_${selectedInvoice.folio_fiscal}.pdf`)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Comprobante de Pago
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesPage;
