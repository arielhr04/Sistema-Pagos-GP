import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import TreasuryReviewNotice from '../components/TreasuryReviewNotice';
import InvoiceDownloadActions from '../components/InvoiceDownloadActions';
import LoadingState from '../components/LoadingState';
import { parseDateOnly } from '../lib/date';
import { buildCacheKey, readApiCache, writeApiCache } from '../lib/apiCache';
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
  Upload,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const CACHE_TTL_INVOICES_MS = 90 * 1000;
const CACHE_TTL_AREAS_MS = 12 * 60 * 60 * 1000;

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'En revisión': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Programada': 'bg-blue-100 text-blue-700 border-blue-200',
  'Pagada': 'bg-green-100 text-green-700 border-green-200',
  'Rechazada': 'bg-red-100 text-red-700 border-red-200',
};

const InvoicesPage = () => {
  const { getAuthHeader, token, user } = useAuth();
  const { demoMode, demoData } = useTour();
  const [invoices, setInvoices] = useState([]);
  const [areas, setAreas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [usuarioFilter, setUsuarioFilter] = useState('');
  const [montoMin, setMontoMin] = useState('');
  const [montoMax, setMontoMax] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [pendingStatus, setPendingStatus] = useState('');
  const [paymentDate, setPaymentDate] = useState(null);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [invoiceReplacementPdfFile, setInvoiceReplacementPdfFile] = useState(null);
  const invoicePdfInputRef = useRef(null);
  const paymentProofInputRef = useRef(null);

  const targetStatus = pendingStatus || selectedInvoice?.estatus || '';
  const hasUploadedPaymentProof = Boolean(selectedInvoice?.comprobante_pago_subido);
  const selectedPaymentDateValue = paymentDate ? format(paymentDate, 'yyyy-MM-dd') : null;
  const originalPaymentDateValue = selectedInvoice?.fecha_pago_real
    ? selectedInvoice.fecha_pago_real.slice(0, 10)
    : null;
  const hasPendingChanges = Boolean(selectedInvoice) && (
    Boolean(paymentProofFile) ||
    targetStatus !== (selectedInvoice?.estatus || '') ||
    (!hasUploadedPaymentProof && targetStatus === 'Pagada' && selectedPaymentDateValue !== originalPaymentDateValue)
  );

  const fetchInvoices = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.invoices) {
      try {
        // Simular latencia mínima para que la UX se sienta real
        await new Promise((resolve) => setTimeout(resolve, 150));
        const mockInvoices = demoData.invoices.items || [];
        setInvoices(mockInvoices);
        setTotalPages(demoData.invoices.total_pages || 1);
        setTotalInvoices(demoData.invoices.total || 0);
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error loading demo invoices:', error);
        setLoading(false);
        return;
      }
    }

    // Modo normal: usar API
    const cacheKey = buildCacheKey(
      'invoices',
      user?.id || user?.email || 'anon',
      searchTerm || 'all',
      statusFilter || 'all',
      areaFilter || 'all',
      usuarioFilter || 'all',
      String(page)
    );
    const cachedData = readApiCache(cacheKey, CACHE_TTL_INVOICES_MS);
    const hasCached = cachedData && Array.isArray(cachedData.items);

    if (hasCached) {
      setInvoices(cachedData.items);
      setTotalPages(cachedData.total_pages || 1);
      setTotalInvoices(cachedData.total || 0);
      setLoading(false);
    }

    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('estatus', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (usuarioFilter) params.append('created_by', usuarioFilter);
      if (montoMin) params.append('monto_min', montoMin);
      if (montoMax) params.append('monto_max', montoMax);
      if (fechaDesde) params.append('fecha_desde', fechaDesde);
      if (fechaHasta) params.append('fecha_hasta', fechaHasta);
      params.append('page', String(page));
      params.append('limit', '20');
      
      const response = await axios.get(
        `${API_URL}/api/invoices?${params.toString()}`,
        getAuthHeader()
      );
      const data = response.data;
      const items = Array.isArray(data) ? data : data.items || [];
      setInvoices(items);
      setTotalPages(data.total_pages || 1);
      setTotalInvoices(data.total || items.length);
      writeApiCache(cacheKey, data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      if (!hasCached) {
        toast.error('Error al cargar facturas');
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, areaFilter, usuarioFilter, montoMin, montoMax, fechaDesde, fechaHasta, page, getAuthHeader, user?.id, user?.email, demoMode, demoData]);

  const fetchAreas = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.areas) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setAreas(demoData.areas.items || []);
        return;
      } catch (error) {
        console.error('Error loading demo areas:', error);
        return;
      }
    }

    // Modo normal: usar API
    const areasCacheKey = buildCacheKey('areas');
    const cachedAreas = readApiCache(areasCacheKey, CACHE_TTL_AREAS_MS);
    const hasCachedAreas = Array.isArray(cachedAreas);

    if (hasCachedAreas) {
      setAreas(cachedAreas);
    }

    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      setAreas(response.data);
      writeApiCache(areasCacheKey, response.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
      if (!hasCachedAreas) {
        toast.error('Error al cargar áreas');
      }
    }
  }, [getAuthHeader, demoMode, demoData]);

  const fetchUsuarios = useCallback(async () => {
    if (user?.rol !== 'Administrador') {
      setUsuarios([]);
      return;
    }

    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.users) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setUsuarios(demoData.users.items || []);
        return;
      } catch (error) {
        console.error('Error loading demo users:', error);
        return;
      }
    }

    // Modo normal: usar API
    const usuariosCacheKey = buildCacheKey('usuarios-list');
    const cachedUsuarios = readApiCache(usuariosCacheKey, CACHE_TTL_AREAS_MS);
    const hasCachedUsuarios = Array.isArray(cachedUsuarios);

    if (hasCachedUsuarios) {
      setUsuarios(cachedUsuarios);
    }

    try {
      const response = await axios.get(`${API_URL}/api/users`, getAuthHeader());
      setUsuarios(response.data);
      writeApiCache(usuariosCacheKey, response.data);
    } catch (error) {
      console.error('Error fetching usuarios:', error);
      if (!hasCachedUsuarios) {
        toast.error('Error al cargar usuarios');
      }
    }
  }, [getAuthHeader, demoMode, demoData, user?.rol]);

  useEffect(() => {
    fetchAreas();
    fetchUsuarios();
  }, []);

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
    setUsuarioFilter('');
    setMontoMin('');
    setMontoMax('');
    setFechaDesde('');
    setFechaHasta('');
    setPage(1);
  };

  const hasActiveFilters = searchTerm || statusFilter || areaFilter || usuarioFilter || montoMin || montoMax || fechaDesde || fechaHasta;

  const handleInvoiceClick = async (invoice) => {
    // Bloquear acciones en modo tour
    if (demoMode) {
      toast.error('No puedes interactuar con facturas durante el tour de demostración');
      return;
    }

    setSelectedInvoice(invoice);
    setPendingStatus(invoice.estatus);
    setPaymentDate(parseDateOnly(invoice.fecha_pago_real));
    setPaymentProofFile(null);
    setInvoiceReplacementPdfFile(null);
    setDialogOpen(true);

    try {
      const response = user?.rol === 'Tesorero'
        ? await axios.post(
            `${API_URL}/api/invoices/${invoice.id}/mark-treasury-reviewed`,
            {},
            getAuthHeader()
          )
        : await axios.get(`${API_URL}/api/invoices/${invoice.id}`, getAuthHeader());

      setSelectedInvoice(response.data);
      setPendingStatus(response.data.estatus);
      setPaymentDate(parseDateOnly(response.data.fecha_pago_real));
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      toast.error('Error al cargar detalle de factura');
    }
  };

  const handleStatusChange = (newStatus) => {
    setPendingStatus(newStatus);
    if (newStatus !== 'Pagada') {
      setPaymentProofFile(null);
    }
  };

  const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

  const handleProofFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error('El archivo no puede superar 10MB');
      return;
    }

    setPaymentProofFile(file);
    toast.success('Archivo listo. Presiona "Confirmar cambios" para guardar.');
  };

  const handleConfirmChanges = async () => {
    // Bloquear cambios en modo tour
    if (demoMode) {
      toast.error('No puedes modificar facturas durante el tour de demostración');
      return;
    }

    if (!selectedInvoice) return;

    const targetStatus = pendingStatus || selectedInvoice.estatus;
    const selectedPaymentDate = paymentDate ? format(paymentDate, 'yyyy-MM-dd') : null;

    if (targetStatus === 'Pagada' && selectedInvoice.estatus !== 'Pagada' && !paymentProofFile) {
      toast.error('Se necesita subir un comprobante de pago antes de confirmar');
      return;
    }

    if (paymentProofFile && targetStatus !== 'Pagada') {
      toast.error('Para guardar comprobante, el estatus debe ser "Pagada"');
      return;
    }

    setUpdating(true);
    try {
      let latestInvoice = selectedInvoice;

      if (paymentProofFile) {
        const formData = new FormData();
        formData.append('proof_file', paymentProofFile);
        const proofResponse = await axios.post(
          `${API_URL}/api/invoices/${selectedInvoice.id}/payment-proof`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          }
        );
        latestInvoice = proofResponse.data;
      }

      const latestPaymentDate = latestInvoice.fecha_pago_real
        ? latestInvoice.fecha_pago_real.slice(0, 10)
        : null;

      const shouldUpdateStatus =
        targetStatus !== latestInvoice.estatus ||
        (targetStatus === 'Pagada' && selectedPaymentDate !== latestPaymentDate);

      if (shouldUpdateStatus) {
        const statusResponse = await axios.put(
          `${API_URL}/api/invoices/${selectedInvoice.id}/status`,
          {
            nuevo_estatus: targetStatus,
            fecha_pago_real: targetStatus === 'Pagada' ? selectedPaymentDate : null,
          },
          getAuthHeader()
        );
        latestInvoice = statusResponse.data;
      }

      if (!hasPendingChanges || (!paymentProofFile && !shouldUpdateStatus)) {
        toast.error('No hay cambios por confirmar');
        return;
      }

      setSelectedInvoice(latestInvoice);
      setPendingStatus(latestInvoice.estatus);
  setPaymentDate(parseDateOnly(latestInvoice.fecha_pago_real));
      setPaymentProofFile(null);
      fetchInvoices();
      toast.success('Cambios guardados correctamente');
    } catch (error) {
      console.error('Error confirming invoice changes:', error);
      console.error('Full error response:', JSON.stringify(error.response, null, 2));

      const errorMsg = error.response?.data?.detail
        || error.response?.data?.message
        || error.response?.data
        || error.message
        || 'Error al confirmar cambios';

      toast.error(errorMsg);
    } finally {
      setUpdating(false);
    }
  };

  const handleInvoicePdfReplacementChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error('El archivo no puede superar 10MB');
      return;
    }
    setInvoiceReplacementPdfFile(file);
    toast.info('Archivo seleccionado. Presiona "Confirmar cambio de archivo" para guardar.');
  };

  const handleConfirmInvoicePdfChange = async () => {
    // Bloquear cambios en modo tour
    if (demoMode) {
      toast.error('No puedes reemplazar PDFs durante el tour de demostración');
      return;
    }

    if (!invoiceReplacementPdfFile || !selectedInvoice) return;
    setUpdating(true);
    try {
      const formData = new FormData();
      formData.append('pdf_file', invoiceReplacementPdfFile);
      const response = await axios.post(
        `${API_URL}/api/invoices/${selectedInvoice.id}/replace-pdf`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setSelectedInvoice(response.data);
      setInvoiceReplacementPdfFile(null);
      fetchInvoices();
      toast.success('PDF de factura actualizado correctamente');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Error al reemplazar el PDF';
      toast.error(errorMsg);
    } finally {
      setUpdating(false);
    }
  };

  // Dropzone for payment proof
  const { getRootProps: getProofRootProps, getInputProps: getProofInputProps, isDragActive: isProofDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: MAX_PDF_SIZE_BYTES,
    multiple: false,
    noKeyboard: true,
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        const error = rejectedFiles[0].errors[0];
        if (error.code === 'file-too-large') {
          toast.error('El archivo no puede superar 10MB');
        } else if (error.code === 'file-invalid-type') {
          toast.error('Solo se permiten archivos PDF');
        } else {
          toast.error('Error al cargar el archivo');
        }
        return;
      }
      if (acceptedFiles.length > 0) {
        handleProofFileChange({ target: { files: [acceptedFiles[0]] } });
      }
    }
  });

  const downloadFile = async (url, filename) => {
    try {
      const response = await axios.get(`${API_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      
      const downloadUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // Extract filename from Content-Disposition header (sent by server)
      let finalFilename = filename;
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/);  
        if (match) finalFilename = match[1];
      }
      link.download = finalFilename;
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
      if (usuarioFilter) params.append('created_by', usuarioFilter);
      if (montoMin) params.append('monto_min', montoMin);
      if (montoMax) params.append('monto_max', montoMax);
      if (fechaDesde) params.append('fecha_desde', fechaDesde);
      if (fechaHasta) params.append('fecha_hasta', fechaHasta);
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative" data-tour="invoices-search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  placeholder="Buscar por proveedor, folio o descripción..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="pl-10"
                  data-testid="invoice-search-input"
                />
              </div>
            
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-48" data-testid="status-filter-select" data-tour="invoices-status-filter">
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

              <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
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
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={showAdvancedFilters ? 'border-red-300 text-red-600' : ''}
                data-tour="invoices-advanced"
              >
                <SlidersHorizontal className="w-4 h-4 mr-1" />
                Filtros
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={handleExportExcel}
                disabled={exporting}
                data-testid="export-excel-btn"
                data-tour="invoices-export"
              >
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="px-3">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {showAdvancedFilters && (
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 pt-3 border-t border-zinc-100 relative z-10">
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Monto mínimo</Label>
                  <Input
                    type="number"
                    placeholder="$0"
                    value={montoMin}
                    onChange={(e) => { setMontoMin(e.target.value); setPage(1); }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Monto máximo</Label>
                  <Input
                    type="number"
                    placeholder="$999,999"
                    value={montoMax}
                    onChange={(e) => { setMontoMax(e.target.value); setPage(1); }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Vencimiento desde</Label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Vencimiento hasta</Label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }}
                    className="h-9"
                  />
                </div>
                {user?.rol === 'Administrador' && (
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Usuario creador</Label>
                    <Select value={usuarioFilter} onValueChange={(val) => { setUsuarioFilter(val); setPage(1); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todos los usuarios" />
                      </SelectTrigger>
                      <SelectContent>
                        {usuarios.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card className="bg-white border border-zinc-200" data-tour="invoices-table">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            Registro de Facturas
            <Badge variant="secondary" className="ml-2 font-mono">
              {totalInvoices}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState sizeClass="h-10 w-10" />
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
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
            <p className="text-sm text-zinc-500">
              Página {page} de {totalPages} ({totalInvoices} registros)
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-3 text-sm font-medium">{page}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
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
                <div className="col-span-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">Datos de Registro</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-sky-700/80">Registró</p>
                      <p className="font-medium text-sm text-sky-950">{selectedInvoice.created_by_nombre || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-sky-700/80">Empresa</p>
                      <p className="font-medium text-sm text-sky-950">{selectedInvoice.empresa_nombre || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <TreasuryReviewNotice reviewedAt={selectedInvoice.fecha_revision_tesoreria} />

              {(user?.rol === 'Administrador' || user?.rol === 'Tesorero') && (
                <>
                  <div className="space-y-2">
                    <Label>Cambiar Estatus</Label>
                    <Select
                      key={`status-${selectedInvoice.id}`}
                      value={pendingStatus || selectedInvoice.estatus}
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

                  {(pendingStatus === 'Pagada' || selectedInvoice.estatus === 'Pagada') && (
                    hasUploadedPaymentProof ? (
                      <div className="space-y-2">
                        <Label>Comprobante de Pago (PDF)</Label>
                        <input
                          ref={paymentProofInputRef}
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleProofFileChange}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => paymentProofInputRef.current?.click()}
                          disabled={updating}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {paymentProofFile ? 'Seleccionar otro archivo' : 'Cambiar archivo'}
                        </Button>
                        {paymentProofFile && (
                          <div className="flex items-center gap-2 text-sm text-zinc-600">
                            <FileText className="w-4 h-4" />
                            <span className="truncate">{paymentProofFile.name}</span>
                          </div>
                        )}
                      </div>
                    ) : (
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
                            {...getProofRootProps()}
                            className={`border-2 border-dashed rounded-lg p-4 text-center ${
                              paymentProofFile ? 'border-green-500 bg-green-50' : 
                              isProofDragActive ? 'border-red-500 bg-red-50' : 
                              'border-zinc-300'
                            }`}
                            style={{ cursor: 'pointer' }}
                          >
                            <input {...getProofInputProps()} />
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
                          </div>
                          {paymentProofFile && (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => setPaymentProofFile(null)}
                              disabled={updating}
                            >
                              Cambiar archivo
                            </Button>
                          )}
                        </div>
                      </>
                    )
                  )}

                  {hasPendingChanges && (
                    <Button
                      type="button"
                      onClick={handleConfirmChanges}
                      className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
                      disabled={updating}
                    >
                      {updating ? 'Guardando...' : 'Confirmar cambios'}
                    </Button>
                  )}
                </>
              )}

              {user?.rol === 'Usuario Área' && selectedInvoice.estatus !== 'Pagada' && (
                <div className="space-y-2 border border-zinc-200 rounded-lg p-3">
                  <Label>Cambiar PDF de Factura</Label>
                  <input
                    ref={invoicePdfInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleInvoicePdfReplacementChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => invoicePdfInputRef.current?.click()}
                    disabled={updating}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {invoiceReplacementPdfFile ? 'Seleccionar otro PDF' : 'Cambiar archivo PDF'}
                  </Button>
                  {invoiceReplacementPdfFile && (
                    <>
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <FileText className="w-4 h-4" />
                        <span className="truncate">{invoiceReplacementPdfFile.name}</span>
                      </div>
                      <Button
                        type="button"
                        onClick={handleConfirmInvoicePdfChange}
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
                        disabled={updating}
                      >
                        {updating ? 'Guardando...' : 'Confirmar cambio de archivo'}
                      </Button>
                    </>
                  )}
                </div>
              )}

              <InvoiceDownloadActions
                invoiceId={selectedInvoice.id}
                folioFiscal={selectedInvoice.folio_fiscal}
                isPaid={selectedInvoice.estatus === 'Pagada'}
                onDownload={downloadFile}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesPage;
