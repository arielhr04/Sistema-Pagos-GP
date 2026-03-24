import { useState, useCallback } from 'react';
import { extractInvoiceDataViaOCR } from '../services/invoicePdfExtraction';

/**
 * Hook para extraer datos de facturas desde PDF
 * Usa OCR en el backend para máxima precisión
 * Retorna el estado de extracción para cada campo
 */
export const useInvoiceExtraction = () => {
  const [extractedData, setExtractedData] = useState(null);
  const [extractionStatus, setExtractionStatus] = useState({}); // { campo: 'filled' | 'empty' }
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);

  const extractFromPdf = useCallback(async (pdfFile) => {
    if (!pdfFile) {
      console.warn('❌ No hay archivo PDF para extraer');
      return null;
    }

    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Usar OCR del backend
      console.log('📄 Extrayendo datos del PDF usando OCR...');
      const data = await extractInvoiceDataViaOCR(pdfFile);
      
      if (!data) {
        console.warn('⚠️ OCR retornó datos vacíos');
        return null;
      }
      
      console.log('🎯 Datos recibidos del OCR:', data);
      setExtractedData(data);

      // Calcular estado de cada campo
      const status = {
        nombre_proveedor: data.nombre_proveedor ? 'filled' : 'empty',
        monto: data.monto ? 'filled' : 'empty',
        folio_fiscal: data.folio_fiscal ? 'filled' : 'empty',
        fecha_vencimiento: data.fecha_vencimiento ? 'filled' : 'empty',
        descripcion_factura: data.descripcion_factura ? 'filled' : 'empty',
      };

      console.log('📋 Estado de extracción por campo:', status);
      setExtractionStatus(status);

      console.log('✅ Retornando datos extraídos:', data);
      return data;
    } catch (error) {
      console.error('❌ Error en extracción OCR:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Error al procesar el PDF';
      setExtractionError(errorMsg);
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const clearExtraction = useCallback(() => {
    setExtractedData(null);
    setExtractionStatus({});
    setExtractionError(null);
  }, []);

  return {
    extractedData,
    extractionStatus,
    isExtracting,
    extractionError,
    extractFromPdf,
    clearExtraction,
  };
};

export default useInvoiceExtraction;
