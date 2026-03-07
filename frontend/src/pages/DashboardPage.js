import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FileText, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Upload,
  Calendar as CalendarIcon,
  ListFilter,
  Download
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const COLORS = ['#DC2626', '#09090B', '#71717A', '#16A34A', '#CA8A04'];

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'En revisión': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Programada': 'bg-blue-100 text-blue-700 border-blue-200',
  'Pagada': 'bg-green-100 text-green-700 border-green-200',
  'Rechazada': 'bg-red-100 text-red-700 border-red-200',
};

const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendUp, color = 'zinc' }) => {
  const colorClasses = {
    red: 'bg-red-50 text-red-600 border-red-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    zinc: 'bg-zinc-50 text-zinc-600 border-zinc-100',
  };

  return (
    <Card className="bg-white border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" strokeWidth={1.5} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-sm font-medium ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
              {trendUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {trend}
            </div>
          )}
        </div>
        <div className="mt-4">
          <h3 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            {value}
          </h3>
          <p className="text-sm font-medium text-zinc-500 mt-1">{title}</p>
          {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

const DashboardPage = () => {
  const { user, token, getAuthHeader } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [myInvoices, setMyInvoices] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentDate, setPaymentDate] = useState(null);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Form state for Usuario Área
  const [formData, setFormData] = useState({
    nombre_proveedor: '',
    descripcion_factura: '',
    area_procedencia: '',
    monto: '',
    fecha_vencimiento: null,
    folio_fiscal: '',
  });
  const [pdfFile, setPdfFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingProof, setIsDraggingProof] = useState(false);

  const canViewStats = user?.rol === 'Administrador' || user?.rol === 'Tesorero';
  const isUsuarioArea = user?.rol === 'Usuario Área';

  const fetchAreas = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      console.log('✅ Áreas cargadas:', response.data);
      setAreas(response.data);
      
      // Pre-select user's area if available
      if (user?.area_id && response.data.length > 0) {
        setFormData(prev => ({ ...prev, area_procedencia: user.area_id }));
      }
    } catch (error) {
      console.error('❌ Error fetching areas:', error);
      toast.error(`Error al cargar áreas: ${error.response?.data?.detail || error.message}`);
    }
  }, [getAuthHeader, user?.area_id]);

  const fetchMyInvoices = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/invoices`, getAuthHeader());
      setMyInvoices(response.data.slice(0, 5)); // Last 5 invoices
    } catch (error) {
      console.error('Error fetching invoices:', error);
    }
  }, [getAuthHeader]);

  const handleInvoiceClick = (invoice) => {
    setSelectedInvoice(invoice);
    setDialogOpen(true);
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedInvoice) return;

    if (newStatus === 'Pagada' && !paymentProofFile) {
      toast.error('Error: Se necesita subir un comprobante de pago');
      return;
    }

    setUpdating(true);
    try {
      if (newStatus === 'Pagada' && paymentProofFile) {
        const formData = new FormData();
        formData.append('proof_file', paymentProofFile);
        await axios.post(
          `${API_URL}/api/invoices/${selectedInvoice.id}/payment-proof`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          }
        );
      }

      const payload = {
        nuevo_estatus: newStatus,
        fecha_pago_real: paymentDate ? format(paymentDate, 'yyyy-MM-dd') : null,
      };
      await axios.put(
        `${API_URL}/api/invoices/${selectedInvoice.id}/status`,
        payload,
        getAuthHeader()
      );
      toast.success('Factura actualizada');
      setDialogOpen(false);
      setPaymentProofFile(null);
      setPaymentDate(null);
      if (canViewStats) fetchData();
      else fetchMyInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error(error.response?.data?.detail || 'Error al actualizar factura');
    } finally {
      setUpdating(false);
    }
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
      setPaymentProofFile(file);
      toast.success('Comprobante subido y factura marcada como Pagada');
      
      // Refresh data
      if (canViewStats) fetchData();
      else fetchMyInvoices();
    } catch (error) {
      console.error('Error uploading proof:', error);
      toast.error(error.response?.data?.detail || 'Error al subir comprobante');
    } finally {
      setUpdating(false);
    }
  };

  const downloadFile = async (url, filename) => {
    try {
      const response = await axios.get(`${API_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      
      // Extract filename from URL if not provided
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
    }).format(value);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (canViewStats) {
        try {
          const response = await axios.get(`${API_URL}/api/dashboard/stats`, getAuthHeader());
          setStats(response.data);
        } catch (error) {
          console.error('Error fetching stats:', error);
          toast.error('Error al cargar estadísticas');
        }
      }

      if (isUsuarioArea) {
        await fetchAreas();
        await fetchMyInvoices();
      }

      setLoading(false);
    };
    fetchData();
  }, [canViewStats, isUsuarioArea, getAuthHeader, fetchAreas, fetchMyInvoices]);

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!isValidPdfFile(file)) {
        toast.error('Solo se permiten archivos PDF');
        return;
      }
      if (file.size > MAX_PDF_SIZE_BYTES) {
        toast.error('El archivo no puede superar 10MB');
        return;
      }
      setPdfFile(file);
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
      setPdfFile(file);
    }
  };

  const handleDragOverProof = (e) => {
    preventDragDefaults(e);
    setIsDraggingProof(true);
  };

  const handleDragLeaveProof = (e) => {
    preventDragDefaults(e);
    // Solo resetear si realmente salimos del contenedor
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingProof(false);
    }
  };

  const handleDropProof = (e) => {
    preventDragDefaults(e);
    setIsDraggingProof(false);
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

  const resetForm = () => {
    setFormData({
      nombre_proveedor: '',
      descripcion_factura: '',
      area_procedencia: user?.area_id || '',
      monto: '',
      fecha_vencimiento: null,
      folio_fiscal: '',
    });
    setPdfFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!pdfFile) {
      toast.error('Debe adjuntar un archivo PDF');
      return;
    }

    if (!formData.fecha_vencimiento) {
      toast.error('Debe seleccionar una fecha de vencimiento');
      return;
    }

    if (!formData.area_procedencia) {
      toast.error('Debe seleccionar un área');
      return;
    }

    setSubmitting(true);

    try {
      const data = new FormData();
      data.append('nombre_proveedor', formData.nombre_proveedor);
      data.append('descripcion_factura', formData.descripcion_factura);
      data.append('area_procedencia', formData.area_procedencia);
      data.append('monto', formData.monto);
      data.append('fecha_vencimiento', format(formData.fecha_vencimiento, 'yyyy-MM-dd'));
      data.append('folio_fiscal', formData.folio_fiscal);
      data.append('pdf_file', pdfFile);

      await axios.post(`${API_URL}/api/invoices`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });

      toast.success('Factura registrada exitosamente');
      resetForm();
      fetchMyInvoices();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error.response?.data?.detail || 'Error al registrar factura');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // Dashboard for Usuario Área with Invoice Registration Form
  if (isUsuarioArea) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="user-dashboard">
        <div>
          <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            Bienvenido, {user?.nombre}
          </h1>
          <p className="text-zinc-500 mt-1">Panel de usuario - {user?.rol}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Invoice Registration Form */}
          <Card className="bg-white border border-zinc-200">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-600" />
                Registrar Nueva Factura
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre_proveedor">Proveedor *</Label>
                    <Input
                      id="nombre_proveedor"
                      value={formData.nombre_proveedor}
                      onChange={(e) => setFormData({ ...formData, nombre_proveedor: e.target.value })}
                      placeholder="Empresa S.A. de C.V."
                      required
                      data-testid="dashboard-provider-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="folio_fiscal">Folio Fiscal *</Label>
                    <Input
                      id="folio_fiscal"
                      value={formData.folio_fiscal}
                      onChange={(e) => setFormData({ ...formData, folio_fiscal: e.target.value })}
                      placeholder="ABC123-DEF456"
                      required
                      data-testid="dashboard-folio-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="area">Área *</Label>
                    <Select
                      value={formData.area_procedencia}
                      onValueChange={(value) => setFormData({ ...formData, area_procedencia: value })}
                    >
                      <SelectTrigger data-testid="dashboard-area-select">
                        <SelectValue placeholder="Seleccionar área" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monto">Monto *</Label>
                    <Input
                      id="monto"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monto}
                      onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                      placeholder="10000.00"
                      required
                      data-testid="dashboard-amount-input"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Fecha de Vencimiento *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="dashboard-date-btn"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.fecha_vencimiento ? (
                            format(formData.fecha_vencimiento, 'PPP', { locale: es })
                          ) : (
                            <span className="text-muted-foreground">Seleccionar fecha</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.fecha_vencimiento}
                          onSelect={(date) => setFormData({ ...formData, fecha_vencimiento: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="descripcion">Descripción *</Label>
                    <Textarea
                      id="descripcion"
                      value={formData.descripcion_factura}
                      onChange={(e) => setFormData({ ...formData, descripcion_factura: e.target.value })}
                      placeholder="Descripción de la factura..."
                      rows={2}
                      required
                      data-testid="dashboard-description-input"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Archivo PDF *</Label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                        pdfFile ? 'border-green-500 bg-green-50' : 
                        isDragging ? 'border-red-500 bg-red-50' : 
                        'border-zinc-300 hover:border-red-500'
                      }`}
                      onDragEnter={handleDragOver}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('pdf-upload-dashboard').click()}
                    >
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="pdf-upload-dashboard"
                        data-testid="dashboard-pdf-input"
                      />
                      {pdfFile ? (
                        <div className="flex items-center justify-center gap-2 text-green-700">
                          <FileText className="w-6 h-6" />
                          <span className="font-medium text-sm">{pdfFile.name}</span>
                        </div>
                      ) : (
                        <div className="text-zinc-500">
                          <Upload className="w-6 h-6 mx-auto mb-1" />
                          <p className="text-sm font-medium">Arrastra aquí el archivo PDF o haz clic para seleccionar</p>
                        </div>
                      )}
                    </div>
                    {!pdfFile && (
                      <p className="text-xs text-zinc-500">* El archivo PDF es obligatorio para registrar la factura</p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm h-11"
                  disabled={submitting || !pdfFile}
                  data-testid="dashboard-submit-btn"
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Registrando...
                    </div>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Registrar Factura
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Recent Invoices */}
          <Card className="bg-white border border-zinc-200">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ListFilter className="w-5 h-5 text-red-600" />
                Mis Facturas Recientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {myInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                  <FileText className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="font-medium">Sin facturas registradas</p>
                  <p className="text-sm">Registre su primera factura</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myInvoices.map((invoice) => (
                    <div 
                      key={invoice.id} 
                      className="p-4 bg-zinc-50 rounded-lg border border-zinc-100 hover:bg-zinc-100 transition-colors cursor-pointer"
                      onClick={() => handleInvoiceClick(invoice)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-zinc-900 truncate">
                            {invoice.nombre_proveedor}
                          </p>
                          <p className="text-xs text-zinc-500 font-mono mt-0.5">
                            {invoice.folio_fiscal}
                          </p>
                        </div>
                        <Badge variant="outline" className={STATUS_STYLES[invoice.estatus]}>
                          {invoice.estatus}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="font-bold text-zinc-900 font-mono">
                          {formatCurrency(invoice.monto)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          Vence: {invoice.fecha_vencimiento.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
                            isDraggingProof ? 'border-red-500 bg-red-50' : 
                            'border-zinc-300'
                          }`}
                          onDragEnter={handleDragOverProof}
                          onDragOver={handleDragOverProof}
                          onDragLeave={handleDragLeaveProof}
                          onDrop={handleDropProof}
                          onClick={() => document.getElementById('proof-upload-dashboard').click()}
                          style={{ cursor: 'pointer' }}
                        >
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleProofFileChange}
                            className="hidden"
                            id="proof-upload-dashboard"
                          />
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
  }

  // Dashboard for Admin/Tesorero
  return (
    <div className="space-y-6 animate-fade-in" data-testid="admin-dashboard">
      <div>
        <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
          Dashboard Ejecutivo
        </h1>
        <p className="text-zinc-500 mt-1">Resumen general del sistema de facturas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
        <StatCard
          title="Facturas Pendientes"
          value={stats?.total_pendientes || 0}
          subtitle="En proceso de revisión"
          icon={FileText}
          color="zinc"
        />
        <StatCard
          title="Por Vencer"
          value={stats?.total_por_vencer || 0}
          subtitle="Próximos 10 días"
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Vencidas"
          value={stats?.total_vencidas || 0}
          subtitle="Requieren atención"
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Pagadas"
          value={stats?.total_pagadas || 0}
          subtitle="Este período"
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Total Amount Card */}
      <Card className="bg-zinc-950 text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm font-medium">Monto Total Comprometido</p>
              <h2 className="text-4xl font-black font-[Chivo] tracking-tight mt-2">
                {formatCurrency(stats?.monto_total_comprometido || 0)}
              </h2>
              <p className="text-zinc-500 text-sm mt-1">Facturas pendientes de pago</p>
            </div>
            <div className="w-16 h-16 bg-red-600 rounded-xl flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Chart */}
        <Card className="bg-white border border-zinc-200">
          <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-600" />
              Facturas por Mes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {stats?.facturas_por_mes?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats.facturas_por_mes}>
                  <defs>
                    <linearGradient id="colorMonto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                  <XAxis 
                    dataKey="mes" 
                    tick={{ fill: '#71717A', fontSize: 12 }}
                    axisLine={{ stroke: '#E4E4E7' }}
                  />
                  <YAxis 
                    tick={{ fill: '#71717A', fontSize: 12 }}
                    axisLine={{ stroke: '#E4E4E7' }}
                    tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value) => [formatCurrency(value), 'Monto']}
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #E4E4E7',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="monto" 
                    stroke="#DC2626" 
                    strokeWidth={2}
                    fill="url(#colorMonto)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-zinc-400">
                No hay datos disponibles
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="bg-white border border-zinc-200">
          <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-600" />
              Distribución por Estatus
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {stats?.facturas_por_estatus?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.facturas_por_estatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="cantidad"
                    nameKey="estatus"
                  >
                    {stats.facturas_por_estatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #E4E4E7',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend 
                    formatter={(value) => <span className="text-sm text-zinc-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-zinc-400">
                No hay datos disponibles
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      {stats?.facturas_por_mes?.length > 0 && (
        <Card className="bg-white border border-zinc-200">
          <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
            <CardTitle className="text-lg font-bold">Cantidad de Facturas por Mes</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.facturas_por_mes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                <XAxis 
                  dataKey="mes" 
                  tick={{ fill: '#71717A', fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fill: '#71717A', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #E4E4E7',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="cantidad" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Chivo]">
              Detalle de Factura
            </DialogTitle>
            <DialogDescription>
              Información completa de la factura.
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
                <div>
                  <p className="text-xs text-zinc-500">Estatus</p>
                  <Badge variant="outline" className={STATUS_STYLES[selectedInvoice.estatus]}>
                    {selectedInvoice.estatus}
                  </Badge>
                </div>
              </div>

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

export default DashboardPage;
