import { useState, useCallback, useEffect } from 'react';
import { useInvoiceExtraction } from '../hooks/useInvoiceExtraction';
import { toast } from 'sonner';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import FormFieldWithExtraction from './FormFieldWithExtraction';
import { PdfOcrSection } from './PdfOcrSection';
import { Plus, FileText, CalendarIcon } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { resolveApiBaseUrl } from '../lib/apiBase';

const API_URL = resolveApiBaseUrl();
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Componente reutilizable para registro de facturas
 * Evita duplicación de código entre diferentes roles
 */
const InvoiceRegistrationForm = ({
  areas = [],
  user,
  token,
  onInvoiceCreated = () => {},
  title = 'Registrar Nueva Factura',
  selectedArea = null, // Para supervisores: área preseleccionada
  onAreaChange = null, // Para supervisores: callback cuando cambia la área
}) => {
  const [formData, setFormData] = useState({
    nombre_proveedor: '',
    descripcion_factura: '',
    monto: '',
    fecha_vencimiento: null,
    folio_fiscal: '',
    requiere_autorizacion: false,
  });
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAreaForSubmit, setSelectedAreaForSubmit] = useState(selectedArea || null);
  const [supervisorAreas, setSupervisorAreas] = useState([]);
  const { extractedData, extractionStatus, isExtracting, extractFromXml, clearExtraction } = useInvoiceExtraction();

  const getAuthHeader = useCallback(() => ({
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }), [token]);

  const getMultipartAuthConfig = useCallback(() => ({
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  }), [token]);

  // Para supervisores, cargar solo sus empresas asignadas
  useEffect(() => {
    if (user?.rol === 'Supervisor' && token) {
      axios.get(`${API_URL}/api/areas/mis-empresas`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(res => setSupervisorAreas(res.data)).catch(() => {});
    }
  }, [user?.rol, token]);

  // Lista de empresas según rol
  const areasToShow = user?.rol === 'Supervisor' ? supervisorAreas : areas;

  const isValidPdfFile = useCallback((file) => {
    if (!file) return false;
    const mime = file.type === 'application/pdf';
    const extension = String(file.name || '').toLowerCase().endsWith('.pdf');
    return mime || extension;
  }, []);

  const getPdfValidationError = useCallback((file) => {
    if (!isValidPdfFile(file)) return 'Solo se permiten archivos PDF';
    if (file.size > MAX_PDF_SIZE_BYTES) return 'El archivo no puede superar 10MB';
    return null;
  }, [isValidPdfFile]);

  const handleDropzoneRejection = useCallback((errorCode) => {
    if (errorCode === 'file-too-large') {
      toast.error('El archivo no puede superar 10MB');
      return;
    }
    if (errorCode === 'file-invalid-type') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    toast.error('Error al cargar el archivo');
  }, []);

  // Autoextraer datos del XML cuando se carga
  useEffect(() => {
    if (xmlFile) {
      console.log('📄 Iniciando extracción del XML CFDI:', xmlFile.name);
      extractFromXml(xmlFile).then((data) => {
        console.log('📨 Datos retornados por extractFromXml:', data);
        if (data) {
          console.log('🔄 Autocompletando formulario con datos extraídos...');
          setFormData(prev => {
            const updatedData = {
              ...prev,
              nombre_proveedor: data.razon_social || prev.nombre_proveedor,
              monto: data.total || prev.monto,
              folio_fiscal: data.folio_fiscal || prev.folio_fiscal,
              fecha_vencimiento: data.fecha_emision 
                ? new Date(data.fecha_emision)
                : prev.fecha_vencimiento,
              descripcion_factura: data.descripcion_factura || prev.descripcion_factura,
            };
            console.log('✅ FormData actualizado:', updatedData);
            return updatedData;
          });

          const filledCount = [
            data.razon_social,
            data.total,
            data.folio_fiscal,
            data.fecha_emision,
            data.descripcion_factura
          ].filter(v => v).length;
          
          console.log(`📊 Campos completados: ${filledCount}`);
          toast.success(`✓ ${filledCount} campos completados automáticamente`);
        } else {
          console.warn('⚠️ No se obtuvieron datos del XML');
          toast.info('No se pudieron extraer datos del XML. Completa los campos manualmente.');
        }
      }).catch((err) => {
        console.error('❌ Error en promise de extracción:', err);
      });
    }
  }, [xmlFile, extractFromXml]);

  const resetForm = () => {
    setFormData({
      nombre_proveedor: '',
      descripcion_factura: '',
      monto: '',
      fecha_vencimiento: null,
      folio_fiscal: '',
      requiere_autorizacion: false,
    });
    setPdfFile(null);
    setXmlFile(null);
    setSelectedAreaForSubmit(selectedArea || null);
    clearExtraction();
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

    if (!formData.nombre_proveedor || !formData.monto || !formData.fecha_vencimiento) {
      toast.error('Por favor completa los campos obligatorios');
      return;
    }

    // Validar que supervisor tiene área seleccionada
    if (user?.rol === 'Supervisor' && !selectedAreaForSubmit) {
      toast.error('Debe seleccionar una empresa');
      return;
    }

    setSubmitting(true);

    try {
      const data = new FormData();
      data.append('nombre_proveedor', formData.nombre_proveedor);
      data.append('descripcion_factura', formData.descripcion_factura);
      data.append('monto', formData.monto);
      data.append('fecha_vencimiento', format(formData.fecha_vencimiento, 'yyyy-MM-dd'));
      data.append('folio_fiscal', formData.folio_fiscal);
      data.append('requiere_autorizacion', formData.requiere_autorizacion);
      data.append('pdf_file', pdfFile);
      if (xmlFile) {
        data.append('xml_file', xmlFile);
      }
      
      // Si es supervisor, enviar empresa_id
      if (user?.rol === 'Supervisor') {
        data.append('empresa_id', selectedAreaForSubmit);
      }

      await axios.post(`${API_URL}/api/invoices`, data, {
        ...getMultipartAuthConfig()
      });

      toast.success('Factura registrada exitosamente');
      resetForm();
      onInvoiceCreated();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error.response?.data?.detail || 'Error al registrar factura');
    } finally {
      setSubmitting(false);
    }
  };

  // Obtener el área a mostrar
  const getCurrentAreaName = () => {
    if (selectedArea) {
      return areas.find(a => a.id === selectedArea)?.nombre || 'Seleccionar área...';
    }
    return areas.find(a => a.id === user?.empresa_id)?.nombre || 'Cargando...';
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* PDF Upload Section */}
          <div className="mb-2 sm:mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2 mb-3">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-blue-700 mt-1">
                  Sube la factura y los datos se rellenarán automáticamente
                </p>
              </div>
            </div>
            <PdfOcrSection
              pdfFile={pdfFile}
              xmlFile={xmlFile}
              onFilesChange={(files) => {
                setPdfFile(files.pdfFile || pdfFile);
                setXmlFile(files.xmlFile || xmlFile);
              }}
              isExtracting={isExtracting}
              extractionStatus={extractionStatus}
              extractedData={extractedData}
              onChangeFiles={() => {
                setPdfFile(null);
                setXmlFile(null);
                clearExtraction();
              }}
              required
              inputId="invoice-registration-pdf-input"
            />
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Row 1: Proveedor y Folio Fiscal */}
            <FormFieldWithExtraction
              label="Proveedor"
              fieldName="nombre_proveedor"
              extractionStatus={extractionStatus}
              required
            >
              <Input
                id="nombre_proveedor"
                value={formData.nombre_proveedor}
                onChange={(e) => setFormData({ ...formData, nombre_proveedor: e.target.value })}
                placeholder="Empresa S.A. de C.V."
                required
                className="text-base"
              />
            </FormFieldWithExtraction>

            <FormFieldWithExtraction
              label="Folio Fiscal"
              fieldName="folio_fiscal"
              extractionStatus={extractionStatus}
              required
            >
              <Input
                id="folio_fiscal"
                value={formData.folio_fiscal}
                onChange={(e) => setFormData({ ...formData, folio_fiscal: e.target.value })}
                placeholder="ABC123-DEF456"
                required
                className="text-base"
              />
            </FormFieldWithExtraction>

            {/* Row 2: Área y Monto */}
            {user?.rol === 'Supervisor' ? (
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="area-select" className="text-sm">Empresa *</Label>
                <Select value={selectedAreaForSubmit || ''} onValueChange={setSelectedAreaForSubmit}>
                  <SelectTrigger id="area-select">
                    <SelectValue placeholder="Seleccionar empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {areasToShow.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="area" className="text-sm">Área *</Label>
                <div className="px-3 py-2 border border-zinc-200 rounded-md bg-zinc-50 text-sm">
                  {getCurrentAreaName()}
                </div>
              </div>
            )}

            <FormFieldWithExtraction
              label="Monto"
              fieldName="monto"
              extractionStatus={extractionStatus}
              required
            >
              <Input
                id="monto"
                type="number"
                step="0.01"
                min="0"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                placeholder="10000.00"
                required
                className="text-base"
              />
            </FormFieldWithExtraction>

            {/* Row 3: Fecha de Vencimiento */}
            <div className="sm:col-span-1">
              <FormFieldWithExtraction
                label="Fecha de Vencimiento"
                fieldName="fecha_vencimiento"
                extractionStatus={extractionStatus}
                required
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
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
              </FormFieldWithExtraction>
            </div>

            {/* Row 4: Descripción */}
            <div className="sm:col-span-2">
              <FormFieldWithExtraction
                label="Descripción"
                fieldName="descripcion_factura"
                extractionStatus={extractionStatus}
                required
              >
                <Textarea
                  id="descripcion"
                  value={formData.descripcion_factura}
                  onChange={(e) => setFormData({ ...formData, descripcion_factura: e.target.value })}
                  placeholder="Descripción de la factura..."
                  rows={2}
                  required
                />
              </FormFieldWithExtraction>
            </div>

            {/* Row 5: Checkbox Requiere Autorización (solo si NO es supervisor) */}
            {user?.rol !== 'Supervisor' && (
              <div className="sm:col-span-2 flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-md">
                <Checkbox
                  id="requiere_autorizacion"
                  checked={formData.requiere_autorizacion}
                  onCheckedChange={(checked) => setFormData({ ...formData, requiere_autorizacion: checked })}
                />
                <Label htmlFor="requiere_autorizacion" className="text-sm cursor-pointer">
                  Esta factura requiere aprobación del supervisor
                </Label>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm h-11"
            disabled={submitting || !pdfFile}
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registrando...
              </div>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Confirmar y registrar factura
              </>
            )}
          </Button>
        </form>
  );

  // When title is null, render form content directly (for use inside a Dialog)
  if (!title) {
    return formContent;
  }

  return (
    <Card className="bg-white border border-zinc-200">
      <CardHeader className="border-b border-zinc-100 bg-zinc-50/50 p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
          <Plus className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {formContent}
      </CardContent>
    </Card>
  );
};

export default InvoiceRegistrationForm;
