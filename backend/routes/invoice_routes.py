from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from io import BytesIO
from pathlib import Path
from openpyxl import Workbook
import shutil
import re

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import (
    InvoiceResponse,
    InvoiceStatusUpdate,
    MovementHistoryResponse,
)
from backend.schemas.enums import RoleEnum, InvoiceStatusEnum
from backend.services.auth_service import require_roles, get_current_user
from backend.services.pdf_storage import PDFStorage
from backend.core.input_validation import sanitize_text, validate_iso_date, validate_uuid_value
from backend.db.session import get_db
from backend.models.invoice import Invoice
from backend.models.area import Area
from backend.models.user import User
from backend.models.movement import MovementHistory

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Maximum allowed PDF size before compression (10MB)
MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

router = APIRouter(prefix="/api", tags=["Invoices"])

TREASURY_REVIEW_PENDING = "Sin revisión de tesorería"
TREASURY_REVIEW_DONE = "Revisada por tesorería"


def sanitize_filename(text: str) -> str:
    """Sanitize filename by removing special characters"""
    # Remove or replace special characters
    text = re.sub(r'[^a-zA-Z0-9._-]', '_', text)
    return text.strip('_')


def log_movement(db: Session, factura_id: str, usuario_id: str, estatus_anterior: str, estatus_nuevo: str):
    movement = MovementHistory(
        factura_id=factura_id,
        usuario_id=usuario_id,
        estatus_anterior=estatus_anterior,
        estatus_nuevo=estatus_nuevo,
        fecha_cambio=datetime.now(timezone.utc),
    )
    db.add(movement)
    db.commit()


def to_iso_string(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value

    if isinstance(value, datetime):
        normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat()

    return str(value)


def get_first_treasury_review(db: Session, invoice_id: str) -> Optional[MovementHistory]:
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

    review_map = {}
    for movement in movements:
        if movement.factura_id not in review_map:
            review_map[movement.factura_id] = to_iso_string(movement.fecha_cambio)

    return review_map


def build_invoice_response(
    inv: Invoice,
    area_nombre: Optional[str] = None,
    created_by_nombre: Optional[str] = None,
    fecha_revision_tesoreria: Optional[str] = None,
) -> InvoiceResponse:
    return InvoiceResponse(
        id=inv.id,
        nombre_proveedor=inv.nombre_proveedor,
        descripcion_factura=inv.descripcion_factura,
        area_procedencia=inv.area_procedencia,
        area_nombre=area_nombre,
        monto=inv.monto,
        fecha_vencimiento=inv.fecha_vencimiento,
        folio_fiscal=inv.folio_fiscal,
        estatus=inv.estatus,
        fecha_pago_real=inv.fecha_pago_real,
        comprobante_pago_subido=bool(inv.comprobante_pago_data),
        created_by=inv.created_by,
        created_by_nombre=created_by_nombre,
        revisada_por_tesoreria=bool(fecha_revision_tesoreria),
        fecha_revision_tesoreria=fecha_revision_tesoreria,
        created_at=to_iso_string(inv.created_at),
        updated_at=to_iso_string(inv.updated_at),
    )


@router.post("/invoices", response_model=InvoiceResponse)
def create_invoice(
    nombre_proveedor: str = Form(...),
    descripcion_factura: str = Form(...),
    area_procedencia: str = Form(...),
    monto: float = Form(...),
    fecha_vencimiento: str = Form(...),
    folio_fiscal: str = Form(...),
    pdf_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        nombre_proveedor = sanitize_text(nombre_proveedor, "nombre_proveedor", max_length=255) or nombre_proveedor
        descripcion_factura = sanitize_text(
            descripcion_factura,
            "descripcion_factura",
            max_length=1024,
            allow_multiline=True,
        ) or descripcion_factura
        area_procedencia = validate_uuid_value(area_procedencia, "area_procedencia", required=True) or area_procedencia
        fecha_vencimiento = validate_iso_date(fecha_vencimiento, "fecha_vencimiento", required=True) or fecha_vencimiento
        folio_fiscal = sanitize_text(folio_fiscal, "folio_fiscal", max_length=255) or folio_fiscal
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Validate PDF file exists and is not empty
    if not pdf_file or not pdf_file.filename:
        raise HTTPException(status_code=400, detail="Debe adjuntar un archivo PDF")
    
    if not pdf_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    # Check file size (max 10MB)
    content = pdf_file.file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo PDF está vacío")
    
    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")

    # Check duplicate folio
    existing = db.query(Invoice).filter(Invoice.folio_fiscal == folio_fiscal).first()
    if existing:
        raise HTTPException(status_code=400, detail="El folio fiscal ya existe")

    # Compress PDF for database storage (saves 70-80% space)
    try:
        compressed_pdf = PDFStorage.compress_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comprimir PDF: {str(e)}")

    now = datetime.now(timezone.utc)

    try:
        invoice_obj = Invoice(
            nombre_proveedor=nombre_proveedor,
            descripcion_factura=descripcion_factura,
            area_procedencia=area_procedencia,
            monto=monto,
            fecha_vencimiento=fecha_vencimiento,
            folio_fiscal=folio_fiscal,
            estatus=InvoiceStatusEnum.CAPTURADA.value,
            pdf_data=compressed_pdf,
            comprobante_pago_data=None,
            fecha_pago_real=None,
            created_by=current_user.id,
            created_at=now,
            updated_at=now,
        )
        db.add(invoice_obj)
        db.commit()
        db.refresh(invoice_obj)

        # Log movement
        log_movement(db, invoice_obj.id, current_user.id, "", InvoiceStatusEnum.CAPTURADA.value)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear factura: {str(e)}")

    area_obj = db.query(Area).filter(Area.id == invoice_obj.area_procedencia).first()

    return build_invoice_response(
        invoice_obj,
        area_nombre=area_obj.nombre if area_obj else None,
        created_by_nombre=current_user.nombre,
    )

@router.get("/invoices", response_model=List[InvoiceResponse])
def get_invoices(
    estatus: Optional[str] = None,
    area: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice)

    if current_user.rol == RoleEnum.USUARIO_AREA.value:
        query = query.filter(Invoice.created_by == current_user.id)
    if estatus:
        query = query.filter(Invoice.estatus == estatus)
    if area:
        query = query.filter(Invoice.area_procedencia == area)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Invoice.nombre_proveedor.ilike(pattern)
            | Invoice.folio_fiscal.ilike(pattern)
            | Invoice.descripcion_factura.ilike(pattern)
        )

    invoices = query.order_by(Invoice.created_at.desc()).limit(200).all()

    areas = {a.id: a.nombre for a in db.query(Area).limit(50).all()}
    users = {u.id: u.nombre for u in db.query(User).limit(100).all()}

    review_dates = get_treasury_review_map(db, [inv.id for inv in invoices])

    return [
        build_invoice_response(
            inv,
            area_nombre=areas.get(inv.area_procedencia),
            created_by_nombre=users.get(inv.created_by),
            fecha_revision_tesoreria=review_dates.get(inv.id),
        )
        for inv in invoices
    ]

@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    area_obj = db.query(Area).filter(Area.id == inv.area_procedencia).first()
    user_obj = db.query(User).filter(User.id == inv.created_by).first()

    treasury_review = get_first_treasury_review(db, invoice_id)

    return build_invoice_response(
        inv,
        area_nombre=area_obj.nombre if area_obj else None,
        created_by_nombre=user_obj.nombre if user_obj else None,
        fecha_revision_tesoreria=to_iso_string(treasury_review.fecha_cambio) if treasury_review else None,
    )

@router.post("/invoices/{invoice_id}/mark-treasury-reviewed", response_model=InvoiceResponse)
def mark_treasury_reviewed(
    invoice_id: str,
    current_user: User = Depends(require_roles(RoleEnum.TESORERO)),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    existing_review = get_first_treasury_review(db, invoice_id)
    if not existing_review:
        log_movement(
            db,
            invoice_id,
            current_user.id,
            TREASURY_REVIEW_PENDING,
            TREASURY_REVIEW_DONE,
        )

    return get_invoice(invoice_id, current_user, db)


@router.post("/invoices/{invoice_id}/replace-pdf", response_model=InvoiceResponse)
def replace_invoice_pdf(
    invoice_id: str,
    pdf_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if inv.estatus == InvoiceStatusEnum.PAGADA.value:
        raise HTTPException(status_code=400, detail="No se puede cambiar el PDF en facturas Pagadas")

    if current_user.rol == RoleEnum.USUARIO_AREA.value and inv.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado para modificar esta factura")

    if not pdf_file or not pdf_file.filename:
        raise HTTPException(status_code=400, detail="Debe adjuntar un archivo PDF")

    if not pdf_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    content = pdf_file.file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo PDF está vacío")

    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")

    try:
        inv.pdf_data = PDFStorage.compress_pdf(content)
        inv.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar PDF: {str(e)}")

    return get_invoice(invoice_id, current_user, db)


@router.put("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
def update_invoice_status(
    invoice_id: str,
    status_update: InvoiceStatusUpdate,
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO)),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    old_status = inv.estatus
    new_status = status_update.nuevo_estatus.value

    if new_status == InvoiceStatusEnum.PAGADA.value:
        if not inv.comprobante_pago_data:
            raise HTTPException(
                status_code=400,
                detail="Error: Se necesita subir un comprobante de pago",
            )

    try:
        inv.estatus = new_status
        inv.updated_at = datetime.now(timezone.utc).isoformat()
        if status_update.fecha_pago_real:
            inv.fecha_pago_real = status_update.fecha_pago_real
        db.commit()

        log_movement(db, invoice_id, current_user.id, old_status, new_status)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar estatus: {str(e)}")
    
    return get_invoice(invoice_id, current_user, db)

@router.post("/invoices/{invoice_id}/payment-proof", response_model=InvoiceResponse)
def upload_payment_proof(
    invoice_id: str,
    proof_file: UploadFile = File(...),
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO)),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if not proof_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    content = proof_file.file.read()
    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")

    # Compress payment proof for database storage
    try:
        compressed_proof = PDFStorage.compress_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comprimir comprobante: {str(e)}")

    # Automatically change status to Pagada when payment proof is uploaded
    old_status = inv.estatus
    
    try:
        inv.comprobante_pago_data = compressed_proof
        inv.estatus = InvoiceStatusEnum.PAGADA.value
        inv.updated_at = datetime.now(timezone.utc).isoformat()
        if not inv.fecha_pago_real:
            inv.fecha_pago_real = datetime.now(timezone.utc).date().isoformat()
        db.commit()

        # Log movement
        if old_status != InvoiceStatusEnum.PAGADA.value:
            log_movement(db, invoice_id, current_user.id, old_status, InvoiceStatusEnum.PAGADA.value)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al procesar comprobante: {str(e)}")

    return get_invoice(invoice_id, current_user, db)

@router.get("/files/{filename}")
def get_file(filename: str, current_user: User = Depends(get_current_user)):
    """Legacy endpoint for backward compatibility. PDFs are now stored in database."""
    raise HTTPException(
        status_code=404,
        detail="Los archivos PDF se almacenan en la base de datos. Use /api/invoices/{id}/download-pdf"
    )


@router.get("/invoices/{invoice_id}/download-pdf")
def download_invoice_pdf(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download compressed PDF of invoice directly from database"""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.pdf_data:
        raise HTTPException(status_code=404, detail="PDF de factura no encontrado")
    
    try:
        # Decompress PDF from database
        pdf_content = PDFStorage.decompress_pdf(inv.pdf_data)
        
        # Generate standardized filename
        sanitized_proveedor = sanitize_filename(inv.nombre_proveedor)
        filename = f"FACGP_{inv.folio_fiscal}_{sanitized_proveedor}.pdf"
        
        # Serve decompressed PDF
        return StreamingResponse(
            BytesIO(pdf_content),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices/{invoice_id}/download-proof")
def download_payment_proof(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download compressed payment proof directly from database"""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.comprobante_pago_data:
        raise HTTPException(status_code=404, detail="Comprobante de pago no encontrado")
    
    try:
        # Decompress proof from database
        proof_content = PDFStorage.decompress_pdf(inv.comprobante_pago_data)
        
        # Generate standardized filename
        sanitized_proveedor = sanitize_filename(inv.nombre_proveedor)
        filename = f"PAGP_{inv.folio_fiscal}_{sanitized_proveedor}.pdf"
        
        # Serve decompressed proof
        return StreamingResponse(
            BytesIO(proof_content),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


# export invoices as Excel spreadsheet
@router.get("/invoices/export/excel")
def export_invoices_excel(
    estatus: Optional[str] = None,
    area: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # mirror filtering logic from get_invoices
    query = db.query(Invoice)
    if current_user.rol == RoleEnum.USUARIO_AREA.value:
        query = query.filter(Invoice.created_by == current_user.id)
    if estatus:
        query = query.filter(Invoice.estatus == estatus)
    if area:
        query = query.filter(Invoice.area_procedencia == area)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Invoice.nombre_proveedor.ilike(pattern)
            | Invoice.folio_fiscal.ilike(pattern)
            | Invoice.descripcion_factura.ilike(pattern)
        )
    invoices = query.order_by(Invoice.created_at.desc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Facturas"
    ws.append([
        "ID",
        "Folio Fiscal",
        "Proveedor",
        "Área",
        "Monto",
        "Estatus",
        "Fecha Vencimiento",
        "Creada Por",
        "Fecha Registro",
    ])
    areas = {a.id: a.nombre for a in db.query(Area).all()}
    users = {u.id: u.nombre for u in db.query(User).all()}
    for inv in invoices:
        ws.append([
            inv.id,
            inv.folio_fiscal,
            inv.nombre_proveedor,
            areas.get(inv.area_procedencia),
            inv.monto,
            inv.estatus,
            inv.fecha_vencimiento,
            users.get(inv.created_by),
            inv.created_at.isoformat() if inv.created_at else None,
        ])
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=facturas.xlsx"},
    )
