"""
Servicio de extracción de datos de facturas CFDI desde XML
"""

import xml.etree.ElementTree as ET
import io
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Namespaces CFDI 3.3 y 4.0
CFDI_NAMESPACES = [
    'http://www.sat.gob.mx/cfd/4',
    'http://www.sat.gob.mx/cfd/3',
]
TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital'


def extract_invoice_data_from_xml(xml_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extrae datos de una factura CFDI desde su archivo XML.
    Soporta CFDI 3.3 y 4.0.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        raise ValueError(f"El archivo no es un XML válido: {str(e)}")

    # Detectar namespace CFDI
    cfdi_ns = None
    for ns in CFDI_NAMESPACES:
        if root.tag == f'{{{ns}}}Comprobante' or root.tag == 'Comprobante':
            cfdi_ns = ns
            break
    
    if cfdi_ns is None:
        # Intentar extraer namespace del tag raíz
        if root.tag.startswith('{'):
            cfdi_ns = root.tag.split('}')[0][1:]
        else:
            raise ValueError("El XML no corresponde a un CFDI válido del SAT")

    ns_map = {
        'cfdi': cfdi_ns,
        'tfd': TFD_NAMESPACE,
    }

    # Extraer Emisor
    emisor = root.find('cfdi:Emisor', ns_map)
    razon_social = None
    if emisor is not None:
        razon_social = emisor.get('Nombre') or emisor.get('nombre')

    # Extraer Total
    total = root.get('Total') or root.get('total')

    # Extraer Fecha de emisión
    fecha_emision = root.get('Fecha') or root.get('fecha')
    if fecha_emision and 'T' in fecha_emision:
        fecha_emision = fecha_emision.split('T')[0]

    # Extraer UUID del TimbreFiscalDigital
    folio_fiscal = None
    complemento = root.find('cfdi:Complemento', ns_map)
    if complemento is not None:
        tfd = complemento.find(f'{{{TFD_NAMESPACE}}}TimbreFiscalDigital')
        if tfd is not None:
            folio_fiscal = tfd.get('UUID') or tfd.get('uuid')

    # Extraer primera Descripcion de Conceptos
    descripcion_factura = None
    conceptos = root.find('cfdi:Conceptos', ns_map)
    if conceptos is not None:
        primer_concepto = conceptos.find('cfdi:Concepto', ns_map)
        if primer_concepto is not None:
            descripcion_factura = primer_concepto.get('Descripcion') or primer_concepto.get('descripcion')

    result = {
        'razon_social': razon_social,
        'total': total,
        'folio_fiscal': folio_fiscal,
        'fecha_emision': fecha_emision,
        'descripcion_factura': descripcion_factura,
    }

    logger.info(f"Datos extraídos del XML CFDI: {result}")
    return result
