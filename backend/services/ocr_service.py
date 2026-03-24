"""
Servicio de OCR para extracción de texto de PDFs
Utiliza pytesseract (Tesseract OCR) para escanear y leer facturas
"""

import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image
import io
import logging
import re
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# Configurar ruta de Tesseract (ajustar según instalación)
# En Windows, pytesseract busca automáticamente en Program Files
# En Linux: pytesseract.pytesseract.pytesseract_cmd = r'/usr/bin/tesseract'


def extract_text_from_pdf_ocr(pdf_bytes: bytes, lang: str = 'spa+eng') -> str:
    """
    Extrae texto de un PDF usando OCR
    
    Args:
        pdf_bytes: Contenido del PDF en bytes
        lang: Idioma para OCR (predeterminado: español + inglés)
    
    Returns:
        Texto extraído del PDF
    """
    try:
        logger.info(f"Iniciando OCR en PDF ({len(pdf_bytes)} bytes)")
        
        # Convertir PDF a imágenes (una por página)
        images = convert_from_bytes(pdf_bytes, dpi=150)
        
        extracted_text = ""
        
        # Procesar cada página
        for page_num, image in enumerate(images, 1):
            logger.info(f"Procesando página {page_num}/{len(images)}")
            
            # Aplicar OCR a la imagen
            page_text = pytesseract.image_to_string(image, lang=lang)
            extracted_text += f"\n--- Página {page_num} ---\n"
            extracted_text += page_text
        
        logger.info(f"OCR completado. Texto extraído: {len(extracted_text)} caracteres")
        return extracted_text
    
    except Exception as error:
        logger.error(f"Error en OCR: {str(error)}")
        raise


def extract_text_from_image_ocr(image_bytes: bytes, lang: str = 'spa+eng') -> str:
    """
    Extrae texto de una imagen usando OCR
    
    Args:
        image_bytes: Contenido de la imagen en bytes
        lang: Idioma para OCR
    
    Returns:
        Texto extraído de la imagen
    """
    try:
        logger.info("Iniciando OCR en imagen")
        
        # Abrir imagen desde bytes
        image = Image.open(io.BytesIO(image_bytes))
        
        # Aplicar OCR
        text = pytesseract.image_to_string(image, lang=lang)
        
        logger.info(f"OCR en imagen completado: {len(text)} caracteres")
        return text
    
    except Exception as error:
        logger.error(f"Error en OCR de imagen: {str(error)}")
        raise


def extract_invoice_data_with_ocr(file_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extrae datos de factura usando OCR y regex
    
    Args:
        file_bytes: Contenido del archivo PDF en bytes
    
    Returns:
        Diccionario con campos extraídos
    """
    try:
        # Extraer texto usando OCR
        text = extract_text_from_pdf_ocr(file_bytes)
        
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
    Extrae nombre de empresa/proveedor (Razón Social) del texto OCR
    
    Estrategias:
    1. Razón Social (primordial)
    2. Empresa, Proveedor, etc.
    3. Línea después de RFC si Razón Social no existe
    """
    try:
        # Estrategia 1: Razón Social (primordial)
        patterns_razon_social = [
            r'[Rr]azón\s+[Ss]ocial[:\s]*([^\n]+)',
            r'[Rr]azón[:\s]*([^\n]+)',
            r'[Ee]misy[:\s]*([^\n]+)',  # A veces aparece como "Emissor" o "Emisyente"
            r'[Ee]misor[:\s]*([^\n]+)',
        ]
        
        for pattern in patterns_razon_social:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                company = match.group(1).strip()
                if len(company) > 3 and len(company) < 200:
                    return company
        
        # Estrategia 2: Palabras clave comunes
        for keyword in ['Empresa', 'Proveedor', 'Facturado por', 'Emitida por']:
            pattern = rf'{keyword}[:\s]*([^\n]+)'
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                company = match.group(1).strip()
                if len(company) > 3:
                    return company
        
        # Estrategia 3: Línea antes de RFC
        rfc_pattern = r'\b[A-ZÑ&]{3,4}\d{6}[A-V0-9]{3}\b'
        rfc_match = re.search(rfc_pattern, text)
        if rfc_match:
            # Buscar la línea anterior al RFC
            rfc_position = rfc_match.start()
            text_before_rfc = text[:rfc_position]
            lines_before = text_before_rfc.strip().split('\n')
            if lines_before:
                last_line = lines_before[-1].strip()
                if len(last_line) > 3 and len(last_line) < 200:
                    return last_line
        
        # Estrategia 4: Primeras líneas significativas
        lines = [line.strip() for line in text.split('\n') if line.strip() and len(line.strip()) > 5 and len(line.strip()) < 200]
        if lines:
            return lines[0]
        
        return None
    
    except Exception as e:
        logger.error(f"Error extrayendo razón social: {str(e)}")
        return None


def extract_amount(text: str) -> Optional[str]:
    """
    Extrae total de la factura
    
    Patrones:
    1. "Total" (primordial)
    2. "Monto"
    3. Formatos de moneda ($ o €)
    4. Números con decimales
    """
    try:
        # Estrategia 1: Total con signo de moneda (primordial)
        patterns = [
            r'[Tt]otal[:\s]*(?:a\s+pagar[:\s]*)?(?:MX\$|\$|€)*\s*([\d,\.]+)',
            r'[Tt]otal\s+a\s+pagar[:\s]*(?:MX\$|\$|€)*\s*([\d,\.]+)',
            r'(?:MX\$|\$|€)\s*([\d,\.]+)(?:\s*(?:MX|pesos|EUR|euros))?(?=\n|$)',
            r'[Mm]onto[:\s]*(?:MX\$|\$|€)\s*([\d,\.]+)',
            r'[Aa]l[:\s]*(?:MX\$|\$|€)\s*([\d,\.]+)',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                # Tomar el último monto encontrado (usualmente es el total)
                amount = matches[-1].replace(',', '')
                if amount.count('.') > 1:
                    amount = amount.replace('.', '', amount.count('.') - 1)
                try:
                    float(amount)
                    return amount
                except ValueError:
                    continue
        
        # Estrategia 2: Buscar cualquier número grande con decimales
        large_numbers = re.findall(r'\d{3,}[.,]\d{2}', text)
        if large_numbers:
            return large_numbers[-1].replace(',', '')
        
        return None
    
    except Exception as e:
        logger.error(f"Error extrayendo monto: {str(e)}")
        return None


def extract_folio(text: str) -> Optional[str]:
    """
    Extrae folio/número de factura
    
    Estrategias (en orden):
    1. Folio Fiscal (patrón mexicano estándar)
    2. UUID (Complemento CFDI)
    3. Factura/Folio con número
    """
    try:
        # Estrategia 1: Búsqueda directa de "Folio Fiscal"
        folio_fiscal_pattern = r'[Ff]olio\s+[Ff]iscal[:\s]*([A-F0-9\-]{32,40}|\d+)'
        match = re.search(folio_fiscal_pattern, text)
        if match:
            folio = match.group(1).strip()
            if folio and len(folio) > 3:
                return folio
        
        # Estrategia 2: UUID/Complemento CFDI (36-40 caracteres hexadecimales)
        uuid_pattern = r'(?:[Uu][Uu][Ii][Dd]|[Uu]uid)[:\s]*([A-F0-9\-]{32,40})'
        match = re.search(uuid_pattern, text)
        if match:
            uuid = match.group(1).strip()
            if uuid and len(uuid) > 32:
                return uuid
        
        # Estrategia 3: UUID sin prefijo (patrón estándar CFDI: 8-4-4-4-12)
        uuid_no_prefix = re.search(r'([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})', text)
        if uuid_no_prefix:
            return uuid_no_prefix.group(1)
        
        # Estrategia 4: Factura/Folio con número
        patterns = [
            r'[Ff]actura[:\s#]*(\w+)',
            r'[Ff]olio[:\s#]*([0-9A-Za-z\-]{5,})',
            r'[Nn]úmero[:\s#]*(\w+)',
            r'^[Ff]actura\s*(\d+)\s*$',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                folio = match.group(1).strip()
                if len(folio) > 3 and len(folio) < 100:
                    return folio
        
        return None
    
    except Exception as e:
        logger.error(f"Error extrayendo folio: {str(e)}")
        return None


def extract_due_date(text: str) -> Optional[str]:
    """
    Extrae fecha de vencimiento
    
    Formatos soportados:
    1. DD/MM/YYYY
    2. YYYY-MM-DD
    3. Mes en texto (enero, feb, etc.)
    """
    try:
        # Estrategia 1: Fecha después de palabras clave
        patterns = [
            r'[Vv]encimiento[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'[Ff]echa[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(?:Hasta el?|Vencimiento)[:\s]*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1).strip()
                # Normalizar a YYYY-MM-DD si es posible
                if '/' in date_str or '-' in date_str:
                    normalized = normalize_date(date_str)
                    if normalized:
                        return normalized
                elif 'de' in date_str:
                    normalized = normalize_text_date(date_str)
                    if normalized:
                        return normalized
        
        # Estrategia 2: Patrón de fecha general
        date_pattern = r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})'
        matches = re.findall(date_pattern, text)
        if matches:
            day, month, year = matches[-1]
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        return None
    
    except Exception as e:
        logger.error(f"Error extrayendo fecha: {str(e)}")
        return None


def extract_description(text: str) -> Optional[str]:
    """
    Extrae descripción/concepto de la factura
    
    Patrones:
    1. Línea después de "Concepto"
    2. "Descripción"
    3. Concepto/productos
    """
    try:
        # Estrategia 1: Después de palabras clave
        patterns = [
            r'[Cc]oncepto[:\s]*([^\n]+)',
            r'[Dd]escripción[:\s]*([^\n]+)',
            r'[Pp]roducto[:\s]*([^\n]+)',
            r'[Pp]or[:\s]*([^\n]+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                description = match.group(1).strip()
                if len(description) > 5:
                    return description
        
        # Estrategia 2: Primeras líneas después del total/monto
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if 'total' in line.lower() and i + 1 < len(lines):
                desc = lines[i + 1].strip()
                if len(desc) > 5:
                    return desc
        
        return None
    
    except Exception as e:
        logger.error(f"Error extrayendo descripción: {str(e)}")
        return None


def normalize_date(date_str: str) -> Optional[str]:
    """
    Normaliza fecha a formato YYYY-MM-DD
    
    Soporta:
    - DD/MM/YYYY
    - DD-MM-YYYY
    - YYYY/MM/DD
    """
    try:
        # Limpiar espacios
        date_str = date_str.strip()
        
        # Reemplazar separadores
        date_str = date_str.replace('-', '/').replace(' ', '/')
        
        parts = date_str.split('/')
        if len(parts) != 3:
            return None
        
        # Detectar formato
        if int(parts[0]) > 31:  # YYYY/MM/DD
            year, month, day = parts
        elif int(parts[2]) < 100:  # DD/MM/YY
            day, month, year = parts
            if int(year) < 50:
                year = '20' + year
            else:
                year = '19' + year
        else:  # DD/MM/YYYY
            day, month, year = parts
        
        # Validar
        month = int(month)
        day = int(day)
        year = int(year)
        
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
        
        return f"{year:04d}-{month:02d}-{day:02d}"
    
    except Exception as e:
        logger.error(f"Error normalizando fecha: {str(e)}")
        return None


def normalize_text_date(date_str: str) -> Optional[str]:
    """
    Normaliza fecha en texto a YYYY-MM-DD
    
    Ejemplo: "15 de enero de 2024"
    """
    try:
        months_es = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
            'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
            'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        }
        
        # Extraer día, mes, año
        pattern = r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})'
        match = re.search(pattern, date_str, re.IGNORECASE)
        
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
