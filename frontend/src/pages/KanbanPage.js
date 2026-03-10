import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import TreasuryReviewNotice from '../components/TreasuryReviewNotice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Label } from '../components/ui/label';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Search, 
  FileText, 
  DollarSign, 
  Calendar as CalendarIcon,
  Upload,
  GripVertical,
  X,
  Download
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const COLUMNS = [
  { id: 'Capturada', title: 'Capturada', color: 'border-t-zinc-500' },
  { id: 'En revisión', title: 'En revisión', color: 'border-t-yellow-500' },
  { id: 'Programada', title: 'Programada', color: 'border-t-blue-500' },
  { id: 'Pagada', title: 'Pagada', color: 'border-t-green-500' },
  { id: 'Rechazada', title: 'Rechazada', color: 'border-t-red-500' },
];

const getTrafficLight = (fechaVencimiento) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(fechaVencimiento);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return { color: 'red', label: 'Vencida', className: 'traffic-red' };
  if (diffDays <= 5) return { color: 'red', label: `${diffDays}d`, className: 'traffic-red' };
  if (diffDays <= 10) return { color: 'yellow', label: `${diffDays}d`, className: 'traffic-yellow' };
  return { color: 'green', label: `${diffDays}d`, className: 'traffic-green' };
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
  }).format(value);
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

// Sortable Invoice Card
const SortableInvoiceCard = ({ invoice, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: invoice.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    scale: isDragging ? 0.95 : 1,
  };

  const traffic = invoice.estatus !== 'Pagada' && invoice.estatus !== 'Rechazada'
    ? getTrafficLight(invoice.fecha_vencimiento)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-2xl ring-2 ring-red-400' : ''
      }`}
      data-testid={`kanban-card-${invoice.id}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="p-1 -ml-1">
            <GripVertical className="w-4 h-4 text-zinc-400" />
          </div>
          {traffic && (
            <Badge variant="outline" className={`${traffic.className} text-xs`}>
              {traffic.label}
            </Badge>
          )}
        </div>

        <h4 className="font-semibold text-zinc-900 text-sm mb-1 line-clamp-1">
          {invoice.nombre_proveedor}
        </h4>
        <p className="text-xs text-zinc-500 font-mono mb-2">
          {invoice.folio_fiscal}
        </p>
        <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
          {invoice.descripcion_factura}
        </p>

        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-zinc-900 font-mono">
            {formatCurrency(invoice.monto)}
          </span>
          <span className="text-xs text-zinc-500">
            {invoice.fecha_vencimiento.slice(0, 10)}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick(invoice);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium text-sm py-2 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
        >
          {invoice.estatus === 'Programada' ? 'Pagar Factura' : 'Ver factura'}
        </button>
      </div>
    </div>
  );
};

// Invoice Card for Drag Overlay
const InvoiceCardOverlay = ({ invoice }) => {
  const traffic = invoice.estatus !== 'Pagada' && invoice.estatus !== 'Rechazada'
    ? getTrafficLight(invoice.fecha_vencimiento)
    : null;

  return (
    <div className="bg-white rounded-lg border-2 border-red-500 shadow-2xl p-4 w-80 scale-110 will-change-transform relative">
      <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="animate-bounce" style={{ animationDuration: '0.6s' }}>
          <GripVertical className="w-5 h-5 text-red-500" />
        </div>
        {traffic && (
          <Badge variant="outline" className={`${traffic.className} text-xs`}>
            {traffic.label}
          </Badge>
        )}
      </div>
      <h4 className="font-semibold text-zinc-900 text-sm mb-1 line-clamp-1">
        {invoice.nombre_proveedor}
      </h4>
      <p className="text-xs text-zinc-500 font-mono mb-2">
        {invoice.folio_fiscal}
      </p>
      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
        {invoice.descripcion_factura}
      </p>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-zinc-900 font-mono">
          {formatCurrency(invoice.monto)}
        </span>
        <span className="text-xs text-zinc-500">
          {invoice.fecha_vencimiento.slice(0, 10)}
        </span>
      </div>
      <button
        className="w-full bg-red-600 text-white font-medium text-sm py-2 px-4 rounded-lg pointer-events-none"
      >
        {invoice.estatus === 'Programada' ? 'Pagar Factura' : 'Ver factura'}
      </button>
    </div>
  );
};

// Droppable Column
const KanbanColumn = ({ column, invoices, onCardClick }) => {
  const total = invoices.reduce((sum, inv) => sum + inv.monto, 0);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <Card className={`bg-white border border-zinc-200 border-t-4 ${column.color} h-full ${isOver ? 'ring-2 ring-red-400 bg-red-50/30' : ''}`}>
        <CardHeader className="p-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase tracking-wide">
              {column.title}
            </CardTitle>
            <Badge variant="secondary" className="font-mono">
              {invoices.length}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 font-mono mt-1">
            {formatCurrency(total)}
          </p>
        </CardHeader>
        <CardContent ref={setNodeRef} className="p-3 space-y-3 min-h-[400px] max-h-[calc(100vh-280px)] overflow-y-auto">
          <SortableContext
            items={invoices.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {invoices.map((invoice) => (
              <SortableInvoiceCard
                key={invoice.id}
                invoice={invoice}
                onClick={onCardClick}
              />
            ))}
          </SortableContext>
          {invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-400">
              <FileText className="w-8 h-8 mb-2" />
              <p className="text-sm">Sin facturas</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KanbanPage = () => {
  const { token, user, getAuthHeader } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [pendingStatus, setPendingStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentDate, setPaymentDate] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchInvoices = useCallback(async () => {
    try {
      const params = searchTerm ? `?search=${searchTerm}` : '';
      const response = await axios.get(`${API_URL}/api/invoices${params}`, getAuthHeader());
      setInvoices(response.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, getAuthHeader]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchInvoices]);

  const getInvoicesByStatus = (status) => {
    return invoices.filter((inv) => inv.estatus === status);
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeInvoice = invoices.find((i) => i.id === active.id);
    if (!activeInvoice) return;

    // Determine target status
    let targetStatus = null;
    
    // Check if dropped directly on a column
    if (COLUMNS.some(c => c.id === over.id)) {
      targetStatus = over.id;
    } else {
      // Dropped on an invoice card, find which column it belongs to
      const overInvoice = invoices.find((i) => i.id === over.id);
      if (overInvoice) {
        targetStatus = overInvoice.estatus;
      }
    }

    if (!targetStatus || activeInvoice.estatus === targetStatus) return;

    // Optimistic update - update UI immediately
    const previousInvoices = [...invoices];
    setInvoices(invoices.map(inv => 
      inv.id === activeInvoice.id 
        ? { ...inv, estatus: targetStatus }
        : inv
    ));

    // Update on server
    try {
      await axios.put(
        `${API_URL}/api/invoices/${activeInvoice.id}/status`,
        { nuevo_estatus: targetStatus },
        getAuthHeader()
      );
      toast.success(`Factura movida a "${targetStatus}"`);
    } catch (error) {
      console.error('Error updating status:', error);
      console.error('Full error response:', JSON.stringify(error.response, null, 2));
      
      // Extraer el mensaje de error del backend
      const errorMsg = error.response?.data?.detail 
        || error.response?.data?.message 
        || error.response?.data 
        || error.message 
        || 'Error al actualizar el estatus';
      
      toast.error(errorMsg);
      // Revert on error
      setInvoices(previousInvoices);
    }
  };

  const handleKanbanDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeInvoice = invoices.find((i) => i.id === active.id);
    const overInvoice = invoices.find((i) => i.id === over.id);

    if (!activeInvoice) return;

    // If over another invoice in same column, reorder
    if (overInvoice && activeInvoice.estatus === overInvoice.estatus) {
      const activeIndex = invoices.findIndex((i) => i.id === active.id);
      const overIndex = invoices.findIndex((i) => i.id === over.id);
      
      if (activeIndex !== overIndex) {
        setInvoices(arrayMove(invoices, activeIndex, overIndex));
      }
    }
  };

  const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

  const openInvoiceDialog = async (invoice) => {
    setSelectedInvoice(invoice);
    setPendingStatus(invoice.estatus);
    setPaymentProofFile(null);
    setInvoiceReplacementPdfFile(null);
    setPaymentDate(parseDateOnly(invoice.fecha_pago_real));
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
      toast.success('PDF de factura actualizado correctamente');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Error al reemplazar el PDF';
      toast.error(errorMsg);
    } finally {
      setUpdating(false);
    }
  };

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
              'Content-Type': 'multipart/form-data',
              'Authorization': `Bearer ${token}`
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
      console.error('Error updating invoice:', error);
      console.error('Full error response:', JSON.stringify(error.response, null, 2));

      const errorMsg = error.response?.data?.detail
        || error.response?.data?.message
        || error.response?.data
        || error.message
        || 'Error al actualizar la factura';

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
        ...getAuthHeader(),
        responseType: 'blob'
      });
      
      const downloadUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // Extract filename from Content-Disposition header (sent by server)
      let finalFilename = filename || 'documento.pdf';
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

  const activeInvoice = activeId ? invoices.find((i) => i.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="kanban-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            Panel Tesorero
          </h1>
          <p className="text-zinc-500 mt-1">Gestión visual de facturas por estatus</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Buscar facturas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="kanban-search-input"
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleKanbanDragOver}
      >
        <div className="flex gap-6 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              invoices={getInvoicesByStatus(column.id)}
              onCardClick={openInvoiceDialog}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{
          duration: 150,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}>
          {activeInvoice ? <InvoiceCardOverlay invoice={activeInvoice} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Invoice Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Chivo]">
              Gestionar Factura
            </DialogTitle>
            <DialogDescription>
              Actualice el estatus y adjunte comprobantes de pago.
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
                      <SelectTrigger data-testid="status-change-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.title}
                          </SelectItem>
                        ))}
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

              {selectedInvoice.estatus === 'Pagada' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <Button
                    onClick={() => downloadFile(`/api/invoices/${selectedInvoice.id}/download-pdf`, `FACGP_${selectedInvoice.folio_fiscal}.pdf`)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                    data-testid="download-invoice-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar PDF de Factura
                  </Button>
                  <Button
                    onClick={() => downloadFile(`/api/invoices/${selectedInvoice.id}/download-proof`, `PAGP_${selectedInvoice.folio_fiscal}.pdf`)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                    data-testid="download-payment-proof"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Comprobante de Pago
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => downloadFile(`/api/invoices/${selectedInvoice.id}/download-pdf`, `FACGP_${selectedInvoice.folio_fiscal}.pdf`)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                  data-testid="download-invoice-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar PDF de Factura
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KanbanPage;
