"""Servicio de facturas — lógica de negocio extraída de las rutas."""

import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.models.invoice import Invoice
from backend.models.movement import MovementHistory
from backend.schemas.invoice_schemas import InvoiceResponse
from backend.services.pdf_storage import PDFStorage

# Límite de tamaño de PDF (10 MB)
MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

TREASURY_REVIEW_PENDING = "Sin revisión de tesorería"
TREASURY_REVIEW_DONE = "Revisada por tesorería"


# ---------------------------------------------------------------------------
# Utilidades de fecha
# ---------------------------------------------------------------------------
def to_iso_string(value) -> Optional[str]:
    """Convertir datetime/str a ISO 8601 string."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat()
    return str(value)


def utc_now() -> datetime:
    """Retorna datetime UTC aware — usar en todos los timestamps."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Validación PDF
# ---------------------------------------------------------------------------
def validate_pdf_upload(pdf_file: UploadFile) -> bytes:
    """Validar y leer contenido de un UploadFile PDF. Retorna bytes crudos."""
    if not pdf_file or not pdf_file.filename:
        raise HTTPException(status_code=400, detail="Debe adjuntar un archivo PDF")

    if not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    content = pdf_file.file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo PDF está vacío")

    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")

    # Validar magic bytes — un PDF real siempre empieza con %PDF-
    if not content[:5] == b"%PDF-":
        raise HTTPException(status_code=400, detail="El archivo no es un PDF válido")

    return content


def compress_pdf_safe(content: bytes, label: str = "PDF") -> bytes:
    """Comprimir PDF con manejo de error uniforme."""
    try:
        return PDFStorage.compress_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comprimir {label}: {str(e)}")


# ---------------------------------------------------------------------------
# Movimientos / auditoría
# ---------------------------------------------------------------------------
def log_movement(db: Session, factura_id: str, usuario_id: str, estatus_anterior: str, estatus_nuevo: str):
    """Registrar un cambio de estatus en el historial."""
    movement = MovementHistory(
        factura_id=factura_id,
        usuario_id=usuario_id,
        estatus_anterior=estatus_anterior,
        estatus_nuevo=estatus_nuevo,
        fecha_cambio=utc_now(),
    )
    db.add(movement)
    db.commit()


# ---------------------------------------------------------------------------
# Treasury review helpers
# ---------------------------------------------------------------------------
def get_first_treasury_review(db: Session, invoice_id: str) -> Optional[MovementHistory]:
    """Primera revisión de tesorería para una factura."""
    return (
        db.query(MovementHistory)
        .filter(
            MovementHistory.factura_id == invoice_id,
            MovementHistory.estatus_nuevo == TREASURY_REVIEW_DONE,
        )
        .order_by(MovementHistory.fecha_cambio.asc())
        .first()
    )


def get_treasury_review_map(db: Session, invoice_ids: List[str]) -> dict:
    """Mapa {invoice_id: fecha_revision} para un lote de facturas."""
    if not invoice_ids:
        return {}

    movements = (
        db.query(MovementHistory)
        .filter(
            MovementHistory.factura_id.in_(invoice_ids),
            MovementHistory.estatus_nuevo == TREASURY_REVIEW_DONE,
        )
        .order_by(MovementHistory.fecha_cambio.asc())
        .all()
    )

    review_map: dict = {}
    for m in movements:
        if m.factura_id not in review_map:
            review_map[m.factura_id] = to_iso_string(m.fecha_cambio)

    return review_map


# ---------------------------------------------------------------------------
# Construcción de respuesta
# ---------------------------------------------------------------------------
def build_invoice_response(
    inv: Invoice,
    empresa_nombre: Optional[str] = None,
    created_by_nombre: Optional[str] = None,
    fecha_revision_tesoreria: Optional[str] = None,
    comprobante_pago_subido: Optional[bool] = None,
    supervisor_nombre: Optional[str] = None,
) -> InvoiceResponse:
    """Construir InvoiceResponse a partir de un modelo Invoice."""
    proof_uploaded = (
        comprobante_pago_subido
        if comprobante_pago_subido is not None
        else bool(inv.comprobante_pago_data)
    )

    return InvoiceResponse(
        id=inv.id,
        nombre_proveedor=inv.nombre_proveedor,
        descripcion_factura=inv.descripcion_factura,
        empresa_factura=inv.empresa_factura,
        empresa_nombre=empresa_nombre,
        monto=inv.monto,
        fecha_vencimiento=inv.fecha_vencimiento,
        folio_fiscal=inv.folio_fiscal,
        estatus=inv.estatus,
        fecha_pago_real=inv.fecha_pago_real,
        comprobante_pago_subido=proof_uploaded,
        created_by=inv.created_by,
        created_by_nombre=created_by_nombre,
        revisada_por_tesoreria=bool(fecha_revision_tesoreria),
        fecha_revision_tesoreria=fecha_revision_tesoreria,
        requiere_autorizacion=inv.requiere_autorizacion,
        aprobada_por_supervisor=inv.aprobada_por_supervisor,
        supervisor_id=inv.supervisor_id,
        supervisor_nombre=supervisor_nombre,
        fecha_aprobacion_supervisor=to_iso_string(inv.fecha_aprobacion_supervisor) if inv.fecha_aprobacion_supervisor else None,
        created_at=to_iso_string(inv.created_at),
        updated_at=to_iso_string(inv.updated_at),
    )


def sanitize_filename(text: str) -> str:
    """Limpiar texto para usar como nombre de archivo."""
    text = re.sub(r"[^a-zA-Z0-9._-]", "_", text)
    return text.strip("_")
