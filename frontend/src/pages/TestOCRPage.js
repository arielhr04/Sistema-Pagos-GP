import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Upload, Copy, Trash2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function TestOCRPage() {
  const [pdfFile, setPdfFile] = useState(null);
  const [formData, setFormData] = useState({
    nombre_proveedor: '',
    monto: '',
    folio_fiscal: '',
    fecha_vencimiento: '',
    descripcion_factura: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [rawText, setRawText] = useState(''); // NUEVO: Texto bruto del OCR
  const [debugInfo, setDebugInfo] = useState(null); // NUEVO: Info de debugging

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setLogs(prev => [...prev, { message: logEntry, type }]);
  };

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 10 * 1024 * 1024,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        addLog(`📄 PDF cargado: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`, 'success');
        setPdfFile(file);
      }
    },
  });

  const handleExtractOCR = async () => {
    if (!pdfFile) {
      addLog('❌ No hay archivo PDF seleccionado', 'error');
      return;
    }

    setIsLoading(true);
    addLog('🔍 Iniciando extracción OCR...', 'info');

    try {
      const token = localStorage.getItem('token');
      addLog(`🔑 Token encontrado: ${token ? '✓' : '✗'}`, token ? 'success' : 'error');

      if (!token) {
        addLog('❌ No hay token de autenticación en localStorage', 'error');
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('pdf_file', pdfFile);

      addLog(`📤 Enviando PDF a: ${API_URL}/api/invoices/extract-ocr`, 'info');
      addLog(`📡 Headers: Authorization: Bearer ${token.substring(0, 20)}...`, 'info');

      const response = await axios.post(
        `${API_URL}/api/invoices/extract-ocr`,
        formDataToSend,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      addLog('✅ Respuesta del servidor recibida', 'success');
      addLog(`📊 Status: ${response.status}`, 'success');
      addLog(`📋 Respuesta completa: ${JSON.stringify(response.data, null, 2)}`, 'info');

      if (response.data && response.data.data) {
        const data = response.data.data;
        addLog('✅ Datos extraídos exitosamente', 'success');
        addLog(`📦 nombre_proveedor: ${data.nombre_proveedor || '(null)'}`, 'info');
        addLog(`💰 monto: ${data.monto || '(null)'}`, 'info');
        addLog(`📄 folio_fiscal: ${data.folio_fiscal || '(null)'}`, 'info');
        addLog(`📅 fecha_vencimiento: ${data.fecha_vencimiento || '(null)'}`, 'info');
        addLog(`📝 descripcion_factura: ${data.descripcion_factura || '(null)'}`, 'info');

        setExtractedData(data);

        // Autocompletar formulario
        setFormData(prev => ({
          ...prev,
          nombre_proveedor: data.nombre_proveedor || prev.nombre_proveedor,
          monto: data.monto || prev.monto,
          folio_fiscal: data.folio_fiscal || prev.folio_fiscal,
          fecha_vencimiento: data.fecha_vencimiento || prev.fecha_vencimiento,
          descripcion_factura: data.descripcion_factura || prev.descripcion_factura,
        }));

        addLog('🎯 Campos del formulario actualizados', 'success');
      } else {
        addLog('⚠️ Respuesta sin estructura de datos esperada', 'error');
      }
    } catch (error) {
      addLog('❌ Error en extracción OCR', 'error');
      addLog(`Error: ${error.message}`, 'error');
      if (error.response) {
        addLog(`Status: ${error.response.status}`, 'error');
        addLog(`Datos del error: ${JSON.stringify(error.response.data)}`, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('🗑️ Logs limpios', 'info');
  };

  const copyLogsToClipboard = () => {
    const logsText = logs.map(log => log.message).join('\n');
    navigator.clipboard.writeText(logsText);
    addLog('📋 Logs copiados al portapapeles', 'success');
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FORMULARIO */}
        <Card className="bg-white">
          <CardHeader className="border-b bg-zinc-50">
            <CardTitle className="text-lg font-bold">🧪 Prueba de OCR</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* PDF Upload */}
            <div>
              <Label className="font-semibold mb-2 block">Archivo PDF *</Label>
              <div
                {...getRootProps()}
                className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <input {...getInputProps()} />
                <Upload className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                {pdfFile ? (
                  <div>
                    <p className="text-sm font-medium text-green-600">✓ {pdfFile.name}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {(pdfFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-zinc-600">Arrastra PDF aquí o haz clic</p>
                    <p className="text-xs text-zinc-400 mt-1">Máximo 10 MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Botón Extraer */}
            <Button
              onClick={handleExtractOCR}
              disabled={!pdfFile || isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? '⏳ Extrayendo...' : '🔍 Extraer OCR'}
            </Button>

            {/* Datos Extraídos */}
            {extractedData && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-bold text-green-700 mb-2">✅ DATOS EXTRAÍDOS:</p>
                <div className="space-y-1 text-xs">
                  <p>
                    <span className="font-semibold">Proveedor:</span>{' '}
                    {extractedData.nombre_proveedor || '(vacío)'}
                  </p>
                  <p>
                    <span className="font-semibold">Monto:</span> {extractedData.monto || '(vacío)'}
                  </p>
                  <p>
                    <span className="font-semibold">Folio:</span>{' '}
                    {extractedData.folio_fiscal || '(vacío)'}
                  </p>
                  <p>
                    <span className="font-semibold">Fecha:</span>{' '}
                    {extractedData.fecha_vencimiento || '(vacío)'}
                  </p>
                  <p>
                    <span className="font-semibold">Descripción:</span>{' '}
                    {extractedData.descripcion_factura || '(vacío)'}
                  </p>
                </div>
              </div>
            )}

            {/* Campos del Formulario */}
            <div className="space-y-3 pt-4 border-t">
              <p className="text-xs font-bold text-zinc-600">FORMULARIO:</p>
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Input
                  value={formData.nombre_proveedor}
                  onChange={(e) => setFormData({ ...formData, nombre_proveedor: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Folio</Label>
                <Input
                  value={formData.folio_fiscal}
                  onChange={(e) => setFormData({ ...formData, folio_fiscal: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Monto</Label>
                <Input
                  value={formData.monto}
                  onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Fecha</Label>
                <Input
                  value={formData.fecha_vencimiento}
                  onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={formData.descripcion_factura}
                  onChange={(e) =>
                    setFormData({ ...formData, descripcion_factura: e.target.value })
                  }
                  className="text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* LOGS */}
        <Card className="bg-white h-full flex flex-col">
          <CardHeader className="border-b bg-zinc-50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold">📋 Logs de Debug</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyLogsToClipboard}
                  title="Copiar logs"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearLogs}
                  title="Limpiar logs"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <p className="text-zinc-400">Esperando acciones...</p>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`${
                    log.type === 'success'
                      ? 'text-green-600'
                      : log.type === 'error'
                      ? 'text-red-600'
                      : 'text-zinc-600'
                  }`}
                >
                  {log.message}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
