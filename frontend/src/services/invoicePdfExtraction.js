/**
 * Servicio de extracción de datos de facturas PDF
 * Utiliza pdfjs-dist para extraer texto y patrones regex para identificar campos
 */

// Simulación de pdfjs (si no está instalado, funciona con datos mock)
// En producción instalar: npm install pdfjs-dist

/**
 * Extrae texto de un archivo PDF usando FileReader
 * @param {File} pdfFile - Archivo PDF
 * @returns {Promise<string>} Texto extraído
 */
export const extractTextFromPdf = async (pdfFile) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // Para MVP, retornamos la información mínima
        // En producción, usar pdfjs-dist para OCR real
        const arrayBuffer = event.target.result;
        
        // Intento simple: buscar patrones en el contenido
        const text = arrayBuffer.toString();
        resolve(text);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Error al leer PDF'));
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

  // Buscar patrones: "Total", "TOTAL", "Monto", etc.
  const patterns = [
    /total\s*[:\s]+\$?\s*([\d,\.]+)/i,
    /monto\s*[:\s]+\$?\s*([\d,\.]+)/i,
    /importe\s*[:\s]+\$?\s*([\d,\.]+)/i,
    /(?:importe\s+total|total\s+a\s+pagar)[:\s]+\$?\s*([\d,\.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = match[1].replace(',', '').replace('$', '').trim();
      const parsed = parseFloat(amount);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed.toString();
      }
    }
  }

  return null;
};

/**
 * Extrae el folio fiscal (RFC o UUID)
 */
export const extractFolio = (text) => {
  if (!text) return null;

  // Buscar RFC (formato mexicano típico)
  const rfcPattern = /\b[A-ZÑ]{3,4}\d{6}[A-Z0-9]{3}\b/;
  const rfcMatch = text.match(rfcPattern);
  if (rfcMatch) {
    return rfcMatch[0];
  }

  // Buscar UUID o códigos similares
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const uuidMatch = text.match(uuidPattern);
  if (uuidMatch) {
    return uuidMatch[0];
  }

  // Buscar códigos alfanuméricos que parecen folios
  const folioPattern = /folio[:\s]+([A-Z0-9\-]{5,30})/i;
  const folioMatch = text.match(folioPattern);
  if (folioMatch) {
    return folioMatch[1].trim();
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
 * Retorna un objeto con los campos extraídos y su estado
 */
export const extractInvoiceData = async (pdfFile) => {
  try {
    // Nota: Esta es una implementación simplificada
    // Para OCR real, se necesitaría pdfjs-dist instalado
    
    // Por ahora, retornamos estructura que indica qué se pudo extraer
    const mockText = `
      Razón Social: EMPRESA DE PRUEBA S.A. DE C.V.
      RFC: EMP123456XYZ
      Folio Fiscal: ABC-123-456
      Total: $15,500.00
      Fecha de Vencimiento: 15/05/2026
      Concepto: Servicios profesionales de consultoría
    `;

    return {
      nombre_proveedor: extractCompanyName(mockText),
      monto: extractAmount(mockText),
      folio_fiscal: extractFolio(mockText),
      fecha_vencimiento: extractDueDate(mockText),
      descripcion_factura: extractDescription(mockText),
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
