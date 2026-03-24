import { useState, useCallback } from 'react';
import { extractInvoiceDataViaXML } from '../services/invoicePdfExtraction';

export const useInvoiceExtraction = () => {
  const [extractedData, setExtractedData] = useState(null);
  const [extractionStatus, setExtractionStatus] = useState({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);

  const extractFromXml = useCallback(async (xmlFile) => {
    if (!xmlFile) return null;

    setIsExtracting(true);
    setExtractionError(null);

    try {
      console.log('📄 Extrayendo datos del XML CFDI...');
      const data = await extractInvoiceDataViaXML(xmlFile);

      if (!data) return null;

      console.log('🎯 Datos recibidos del XML:', data);
      setExtractedData(data);

      const status = {
        nombre_proveedor: data.razon_social ? 'filled' : 'empty',
        monto: data.total ? 'filled' : 'empty',
        folio_fiscal: data.folio_fiscal ? 'filled' : 'empty',
        fecha_emision: data.fecha_emision ? 'filled' : 'empty',
        descripcion_factura: data.descripcion_factura ? 'filled' : 'empty',
      };

      setExtractionStatus(status);
      return data;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Error al procesar el XML';
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
    extractFromXml,
    clearExtraction,
  };
};

export default useInvoiceExtraction;
