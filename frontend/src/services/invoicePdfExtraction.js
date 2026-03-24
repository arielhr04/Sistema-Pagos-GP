/**
 * Servicio de extracción de datos de facturas PDF
 * Usa OCR en el backend para extraer datos de PDFs reales y escaneados
 * 
 * Backend: Pytesseract con soporte español/inglés
 */

import { apiClient } from './apiClient';

/**
 * Extrae datos de factura usando OCR en el backend
 * @param {File} pdfFile - Archivo PDF
 * @returns {Promise<Object>} Datos extraídos {nombre_proveedor, monto, folio_fiscal, fecha_vencimiento, descripcion_factura}
 */
export const extractInvoiceDataViaOCR = async (pdfFile) => {
  try {
    const formData = new FormData();
    formData.append('pdf_file', pdfFile);
    
    // Llamar al endpoint de OCR del backend
    const response = await apiClient.post('/invoices/extract-ocr', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (response.data && response.data.data) {
      return response.data.data;
    }
    
    return {
      nombre_proveedor: null,
      monto: null,
      folio_fiscal: null,
      fecha_vencimiento: null,
      descripcion_factura: null,
    };
  } catch (error) {
    console.error('Error en extracción OCR del backend:', error);
    throw error;
  }
};

/**
 * Extrae texto plano de un PDF binario (fallback)
 * Para PDFs con texto embebido cuando OCR no está disponible
 */
const extractTextFromPdfBinary = (arrayBuffer) => {
  try {
    const view = new Uint8Array(arrayBuffer);
    let text = '';
    
    for (let i = 0; i < view.length; i++) {
      const byte = view[i];
      if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
        text += String.fromCharCode(byte);
      }
    }
    
    return text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
};

/**
 * Lee un archivo PDF y retorna su contenido como texto
 * @param {File} pdfFile - Archivo PDF
 * @returns {Promise<string>} Texto extraído del PDF
 */
export const extractTextFromPdf = async (pdfFile) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target.result;
        const text = extractTextFromPdfBinary(arrayBuffer);
        resolve(text);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Error al leer el archivo PDF'));
    reader.readAsArrayBuffer(pdfFile);
  });
};

/**
 * Valida si un string parece ser un nombre de empresa válido
 */
const isValidCompanyName = (text) => {
  if (!text || text.length < 3 || text.length > 150) return false;
  
  const invalid = [
    'Página', 'Total', 'Importe', 'Subtotal', 'RFC', 'Fecha',
    'Impuesto', 'IVA', 'ISR', 'IEPS', 'Retencion', 'Descuento',
    'Concepto', 'Cantidad', 'Precio', 'Factura', 'Folio'
  ];
  
  return !invalid.some(word => text.toUpperCase().includes(word));
};

/**
 * Extrae el nombre del proveedor con múltiples estrategias
 */
export const extractCompanyName = (text) => {
  if (!text) return null;

  // Estrategia 1: Buscar por etiquetas explícitas
  const labelPatterns = [
    /razón\s*social[:\s]+([^\n]{3,100})/i,
    /empresa[:\s]+([^\n]{3,100})/i,
    /proveedor[:\s]+([^\n]{3,100})/i,
    /expedidor[:\s]+([^\n]{3,100})/i,
    /emisor[:\s]+([^\n]{3,100})/i,
  ];

  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match && isValidCompanyName(match[1])) {
      return match[1].trim();
    }
  }

  // Estrategia 2: Buscar nombre próximo a RFC
  const rfcPattern = /^([A-Z][^\n]{3,100})\s*\n[\s\S]{0,100}RFC/m;
  const rfcMatch = text.match(rfcPattern);
  if (rfcMatch && isValidCompanyName(rfcMatch[1])) {
    return rfcMatch[1].trim();
  }

  // Estrategia 3: Primera línea válida (heurística)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  for (const line of lines.slice(0, 20)) {
    const trimmed = line.trim();
    if (isValidCompanyName(trimmed) && /^[A-Z]/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
};

/**
 * Extrae el monto de la factura
 */
export const extractAmount = (text) => {
  if (!text) return null;

  // Buscar patrones comunes de montos en facturas mexicanas
  const patterns = [
    /(?:total|monto|importe)\s*(?:a\s+pagar)?[:\s]*\$?\s*([\d,\.]+)(?:\s*(?:MX)?N?)/i,
    /\$\s*([\d,\.]+)(?:\s*(?:MXN|peso|pesos))?/i,
    /(?:importe\s+total)[:\s]*\$?\s*([\d,\.]+)/i,
    /(?:cantidad|precio)\s*[:\s]*\$?\s*([\d,\.]+)/i,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const amount = match[1].replace(/\s/g, '').replace(',', '').trim();
      const parsed = parseFloat(amount);
      // Filtrar montos razonables (mayor a 0 y menor a 999,999,999)
      if (!isNaN(parsed) && parsed > 0 && parsed < 999999999) {
        return parsed.toString();
      }
    }
  }

  return null;
};

/**
 * Extrae el folio fiscal (RFC, UUID, o código similar)
 */
export const extractFolio = (text) => {
  if (!text) return null;

  // Patrones en orden de especificidad

  // 1. Buscar UUID de factura electrónica (CFDI)
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const uuidMatch = text.match(uuidPattern);
  if (uuidMatch) {
    return uuidMatch[0];
  }

  // 2. Buscar RFC (formato mexicano: 3-4 letras + 6 números + 3 alfanuméricos)
  const rfcPattern = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/;
  const rfcMatch = text.match(rfcPattern);
  if (rfcMatch) {
    return rfcMatch[0];
  }

  // 3. Buscar folio explícitamente etiquetado
  const folioLabelPattern = /(?:folio|folio\s+fiscal)[:\s]*([A-Z0-9\-]{5,50})/i;
  const folioMatch = text.match(folioLabelPattern);
  if (folioMatch) {
    const folio = folioMatch[1].trim();
    // Validar que no sea una palabra común
    if (!/^(del|de|la|the|a|o)$/i.test(folio) && folio.length > 3) {
      return folio;
    }
  }

  // 4. Buscar código de serie + folio (patrón: letra/número seguido de números)
  const seriePattern = /\b[A-Z]{1,3}[\s-]?\d{1,10}\b/;
  const serieMatch = text.match(seriePattern);
  if (serieMatch) {
    return serieMatch[0].replace(/\s/g, '');
  }

  return null;
};

/**
 * Extrae la fecha de vencimiento
 */
export const extractDueDate = (text) => {
  if (!text) return null;

  // Buscar patrones de fecha: dd/mm/yyyy, dd-mm-yyyy, etc.
  const datePatterns = [
    /vencimiento[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /fecha\s+vencimiento[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /(?:pago|vencimiento|hasta)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeDateFormat(match[1]);
    }
  }

  return null;
};

/**
 * Normaliza diferentes formatos de fecha a YYYY-MM-DD
 */
const normalizeDateFormat = (dateStr) => {
  // Intentar parsear diferentes formatos
  const parts = dateStr.match(/(\d{1,4})/g);
  if (!parts || parts.length < 3) return null;

  let day, month, year;

  // Detectar formato: dd/mm/yyyy o yyyy/mm/dd
  if (parseInt(parts[2]) > 31) {
    // Formato yyyy/mm/dd
    [year, month, day] = parts;
  } else {
    // Formato dd/mm/yyyy
    [day, month, year] = parts;
  }

  // Convertir año de 2 dígitos a 4
  if (year.length === 2) {
    year = `20${year}`;
  }

  // Validar fecha
  const date = new Date(year, parseInt(month) - 1, day);
  if (isNaN(date.getTime())) return null;

  // Retornar en formato YYYY-MM-DD
  return date.toISOString().split('T')[0];
};

/**
 * Extrae descripción de la factura (concepto)
 */
export const extractDescription = (text) => {
  if (!text) return null;

  // Buscar secciones de concepto/descripción
  const patterns = [
    /concepto[:\s]+([^\n]{5,200})/i,
    /descripción[:\s]+([^\n]{5,200})/i,
    /asunto[:\s]+([^\n]{5,200})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
};

/**
 * Función principal: Extrae todos los datos del PDF
 * Lee el contenido real del PDF y aplica detección inteligente
 */
export const extractInvoiceData = async (pdfFile) => {
  try {
    if (!pdfFile) {
      return {
        nombre_proveedor: null,
        monto: null,
        folio_fiscal: null,
        fecha_vencimiento: null,
        descripcion_factura: null,
      };
    }

    // Extraer texto real del PDF
    const text = await extractTextFromPdf(pdfFile);

    if (!text) {
      console.warn('No se pudo extraer texto del PDF');
      return {
        nombre_proveedor: null,
        monto: null,
        folio_fiscal: null,
        fecha_vencimiento: null,
        descripcion_factura: null,
      };
    }

    // Extraer datos usando las funciones de detección
    return {
      nombre_proveedor: extractCompanyName(text),
      monto: extractAmount(text),
      folio_fiscal: extractFolio(text),
      fecha_vencimiento: extractDueDate(text),
      descripcion_factura: extractDescription(text),
    };
  } catch (error) {
    console.error('Error en extracción de PDF:', error);
    return {
      nombre_proveedor: null,
      monto: null,
      folio_fiscal: null,
      fecha_vencimiento: null,
      descripcion_factura: null,
      error: error.message,
    };
  }
};

export default {
  extractInvoiceData,
  extractCompanyName,
  extractAmount,
  extractFolio,
  extractDueDate,
  extractDescription,
};
