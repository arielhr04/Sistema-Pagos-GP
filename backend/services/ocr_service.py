import pdfplumber
import io
import logging
import re
from typing import Optional, Dict

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extrae texto directamente del PDF digital.
    No convierte a imagen — lee el texto embebido.
    """
    try:
        full_text = ""
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                logger.info(f"Procesando página {page_num}/{len(pdf.pages)}")
                page_text = page.extract_text() or ""
                full_text += f"\n--- Página {page_num} ---\n"
                full_text += page_text
        logger.info(f"Extracción completada. Caracteres: {len(full_text)}")
        return full_text
    except Exception as e:
        logger.error(f"Error extrayendo texto del PDF: {str(e)}")
        raise


def extract_invoice_data_with_ocr(file_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extrae datos de factura CFDI desde PDF digital.
    Mantiene la misma interfaz que la versión anterior con Tesseract.
    """
    try:
        text = extract_text_from_pdf(file_bytes)
        
        # Extraer datos específicos usando funciones de patrón
        extracted_data = {
            'razon_social': extract_company_name(text),
            'total': extract_amount(text),
            'folio_fiscal': extract_folio(text),
            'fecha_vencimiento': extract_due_date(text),
            'descripcion_factura': extract_description(text),
        }
        
        logger.info(f"Datos extraídos: {extracted_data}")
        
        return extracted_data
    
    except Exception as error:
        logger.error(f"Error en extracción de datos: {str(error)}")
        return {
            'razon_social': None,
            'total': None,
            'folio_fiscal': None,
            'fecha_vencimiento': None,
            'descripcion_factura': None,
            'error': str(error),
        }


def extract_company_name(text: str) -> Optional[str]:
    """
    Extrae razón social del EMISOR (proveedor).
    IMPORTANTE: Ignore RECEPTOR (cliente). Solo extraer EMISOR.
    """
    try:
        # Estrategia 1: Buscar ANTES de RECEPTOR para evitar capturar al cliente
        # Dividir el texto en sección EMISOR y RECEPTOR
        receptor_pos = text.upper().find('RECEPTOR')
        if receptor_pos > 0:
            text_emisor = text[:receptor_pos]
        else:
            text_emisor = text

        # Estrategia 1: Razón Social explícita con etiqueta "Emisor"
        patterns_razon_social = [
            r'[Ee]misor[:\s]*([^\n]+)',
            r'[Rr]az[oó]n\s+[Ss]ocial[:\s]*([^\n]+)',
            r'[Dd]enominaci[oó]n[:\s]*([^\n]+)',
        ]
        for pattern in patterns_razon_social:
            match = re.search(pattern, text_emisor, re.IGNORECASE)
            if match:
                company = match.group(1).strip()
                
                # Limpiar RFC y separadores de la misma línea
                rfc_pattern = r'[A-ZÑ&]{3,4}\d{6}[A-HJ-NP-Z\d]{3}'
                rfc_match = re.search(rfc_pattern, company)
                if rfc_match:
                    company = company[:rfc_match.start()].strip()
                
                # Limpiar separadores comunes
                company = re.split(r'\||\t|  +', company)[0].strip()
                
                if 3 < len(company) < 200:
                    return company

        # Estrategia 2: Línea ANTES del RFC en sección EMISOR
        rfc_pattern = r'\b([A-ZÑ&]{3,4}\d{6}[A-HJ-NP-Z\d]{3})\b'
        rfc_match = re.search(rfc_pattern, text_emisor)
        if rfc_match:
            text_before_rfc = text_emisor[:rfc_match.start()]
            lines_before = [l.strip() for l in text_before_rfc.split('\n') if l.strip()]
            if lines_before:
                candidate = lines_before[-1]
                # Limpiar separadores
                candidate = re.split(r'\||\t|  +', candidate)[0].strip()
                if 3 < len(candidate) < 200:
                    return candidate

        return None

    except Exception as e:
        logger.error(f"Error extrayendo razón social: {str(e)}")
        return None


def extract_amount(text: str) -> Optional[str]:
    """
    Extrae el total de la factura.
    Usa 'Total' como ancla principal para evitar capturar subtotales o IVA.
    """
    try:
        # Estrategia 1: Total como ancla directa
        patterns = [
            r'[Tt]otal\s+a\s+pagar[:\s]*(?:MX\$|\$|€)?\s*([\d,]+\.\d{2})',
            r'[Tt]otal[:\s]*(?:MX\$|\$|€)?\s*([\d,]+\.\d{2})',
            r'(?:MX\$|\$)\s*([\d,]+\.\d{2})\s*$',
            r'[Mm]onto\s+total[:\s]*(?:MX\$|\$)?\s*([\d,]+\.\d{2})',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, text, re.MULTILINE)
            if matches:
                # Tomar el último match (el total final, no subtotales)
                amount = matches[-1].replace(',', '')
                try:
                    float(amount)
                    return amount
                except ValueError:
                    continue

        # Estrategia 2: Número grande con decimales como fallback
        large_numbers = re.findall(r'\d{3,}[.,]\d{2}', text)
        if large_numbers:
            return large_numbers[-1].replace(',', '')

        return None

    except Exception as e:
        logger.error(f"Error extrayendo monto: {str(e)}")
        return None


def extract_folio(text: str) -> Optional[str]:
    """
    Extrae folio fiscal / UUID CFDI.
    El patrón es case-insensitive para cubrir variaciones del texto extraído.
    """
    try:
        # Estrategia 1: UUID estándar CFDI (8-4-4-4-12) — case insensitive
        uuid_pattern = r'([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})'
        match = re.search(uuid_pattern, text)
        if match:
            return match.group(1).upper()

        # Estrategia 2: Folio Fiscal con etiqueta
        folio_pattern = r'[Ff]olio\s+[Ff]iscal[:\s]*([A-Fa-f0-9\-]{32,40}|\d+)'
        match = re.search(folio_pattern, text)
        if match:
            folio = match.group(1).strip()
            if len(folio) > 3:
                return folio

        # Estrategia 3: Número de factura/folio corto
        patterns = [
            r'[Ff]actura[:\s#]*([\w\-]{3,})',
            r'[Ff]olio[:\s#]*([0-9A-Za-z\-]{3,})',
            r'[Nn][oú]mero[:\s#]*([\w\-]{3,})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                folio = match.group(1).strip()
                if 3 < len(folio) < 100:
                    return folio

        return None

    except Exception as e:
        logger.error(f"Error extrayendo folio: {str(e)}")
        return None


def extract_due_date(text: str) -> Optional[str]:
    """
    Extrae fecha de VENCIMIENTO (due date) del CFDI.
    Busca SOLO etiquetas de fecha de vencimiento.
    Si no encuentra, retorna None — NO cae a fecha de emisión u otra fecha.
    """
    try:
        # Patrones para buscar SOLO fecha de vencimiento
        # Cubre: "Vencimiento", "Fecha de vencimiento", "Fecha límite de pago", etc.
        due_date_patterns = [
            r'[Ff]echa\s+de\s+[Vv]encimiento[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Vv]encimiento[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Ff]echa\s+[Ll][íi]mite\s+de\s+[Pp]ago[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Ff]echa\s+[Ll][íi]mite[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Pp]agar\s+antes\s+de[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Vv][áa]lido\s+hasta[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Dd]ue\s+[Dd]ate[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        ]
        
        for pattern in due_date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1).strip()
                normalized = normalize_date(date_str) if ('/' in date_str or '-' in date_str) else normalize_text_date(date_str)
                if normalized:
                    logger.info(f"Fecha de vencimiento extraída: {normalized}")
                    return normalized

        # Si no encuentra etiqueta de vencimiento, retorna None
        logger.info("No se encontró etiqueta de fecha de vencimiento")
        return None

    except Exception as e:
        logger.error(f"Error extrayendo fecha de vencimiento: {str(e)}")
        return None


def extract_description(text: str) -> Optional[str]:
    """
    Extrae descripción del concepto/producto de la tabla de la factura.
    Encuentra la columna "Descripción" y lee el valor en la fila siguiente.
    NO retorna el header "Descripción", sino el contenido de la primera fila descargable.
    """
    try:
        # Encontrar la línea que contiene "Descripción" (el header)
        descripcion_match = re.search(r'^[^\n]*[Dd]escripci[oó]n[^\n]*$', text, re.MULTILINE)
        if not descripcion_match:
            return None

        # Obtener el final de la línea del header
        header_end_pos = descripcion_match.end()
        
        # Obtener el resto del texto después del header
        text_after_header = text[header_end_pos:]
        
        # Dividir en líneas y encontrar la primera línea no vacía que NO sea otro header
        lines = text_after_header.split('\n')
        
        # Headers de columnas a ignorar (no son descripción)
        column_headers = ['Cantidad', 'Unidad', 'Precio', 'Importe', 'P.U.', 'Subtotal', 'Total', 
                         'Impuesto', 'Tasa', 'Concepto', 'Código', 'Retencion', 'Traslado']
        
        for line in lines:
            line_stripped = line.strip()
            
            # Saltar líneas vacías
            if not line_stripped:
                continue
            
            # Saltar si es otro header de columna
            is_column_header = False
            for header in column_headers:
                if re.search(rf'\b{header}\b', line_stripped, re.IGNORECASE):
                    is_column_header = True
                    break
            
            if is_column_header:
                continue
            
            # Encontramos la descripción (primera línea válida)
            if len(line_stripped) > 5:
                logger.info(f"Descripción extraída de tabla: {line_stripped}")
                return line_stripped

        return None

    except Exception as e:
        logger.error(f"Error extrayendo descripción: {str(e)}")
        return None


def normalize_date(date_str: str) -> Optional[str]:
    try:
        date_str = date_str.strip().replace('-', '/').replace(' ', '/')
        parts = date_str.split('/')
        if len(parts) != 3:
            return None

        if int(parts[0]) > 31:       # YYYY/MM/DD
            year, month, day = parts
        elif len(parts[2]) == 2:     # DD/MM/YY
            day, month, year = parts
            year = ('20' if int(year) < 50 else '19') + year
        else:                        # DD/MM/YYYY
            day, month, year = parts

        month, day, year = int(month), int(day), int(year)
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None

        return f"{year:04d}-{month:02d}-{day:02d}"

    except Exception as e:
        logger.error(f"Error normalizando fecha: {str(e)}")
        return None


def normalize_text_date(date_str: str) -> Optional[str]:
    try:
        months_es = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
            'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
            'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        }
        match = re.search(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', date_str, re.IGNORECASE)
        if not match:
            return None
        day, month_name, year = match.groups()
        month = months_es.get(month_name.lower())
        if not month:
            return None
        return f"{year}-{month:02d}-{int(day):02d}"

    except Exception as e:
        logger.error(f"Error normalizando fecha en texto: {str(e)}")
        return None
