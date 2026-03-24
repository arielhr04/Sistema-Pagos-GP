/**
 * Servicio de extracción de datos de facturas CFDI desde XML
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Extrae datos de factura enviando el XML CFDI al backend
 * @param {File} xmlFile - Archivo XML del CFDI
 * @returns {Promise<Object>} Datos extraídos
 */
export const extractInvoiceDataViaXML = async (xmlFile) => {
  try {
    const formData = new FormData();
    formData.append('xml_file', xmlFile);

    const token = localStorage.getItem('token');

    console.log('📄 Extrayendo datos del XML CFDI:', xmlFile.name);

    const response = await axios.post(`${API_URL}/api/invoices/extract-xml`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('📊 Respuesta del backend:', response.data);

    if (response.data && response.data.data) {
      return response.data.data;
    }

    return {
      razon_social: null,
      total: null,
      folio_fiscal: null,
      fecha_emision: null,
      descripcion_factura: null,
    };
  } catch (error) {
    console.error('❌ Error extrayendo XML:', error.response?.data || error.message);
    throw error;
  }
};

export default { extractInvoiceDataViaXML };
