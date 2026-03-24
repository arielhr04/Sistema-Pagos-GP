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
    if (!pdfFile) return;

    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Usar OCR del backend
      const data = await extractInvoiceDataViaOCR(pdfFile);
      setExtractedData(data);

      // Calcular estado de cada campo
      const status = {
        nombre_proveedor: data.nombre_proveedor ? 'filled' : 'empty',
        monto: data.monto ? 'filled' : 'empty',
        folio_fiscal: data.folio_fiscal ? 'filled' : 'empty',
        fecha_vencimiento: data.fecha_vencimiento ? 'filled' : 'empty',
        descripcion_factura: data.descripcion_factura ? 'filled' : 'empty',
      };

      setExtractionStatus(status);

      return data;
    } catch (error) {
      console.error('Error en extracción OCR:', error);
      setExtractionError(error.message || 'Error al procesar el PDF');
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
