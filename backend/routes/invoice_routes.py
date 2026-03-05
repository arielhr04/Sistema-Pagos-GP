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
    # Validate PDF
    if not pdf_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    # Check file size (max 10MB)
    content = pdf_file.file.read()
    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")

    # Check duplicate folio
    existing = db.query(Invoice).filter(Invoice.folio_fiscal == folio_fiscal).first()
    if existing:
        raise HTTPException(status_code=400, detail="El folio fiscal ya existe")

    # Compress PDF for database storage (saves 70-80% space)
    try:
        compressed_pdf = PDFStorage.compress_pdf(content)
        original_size_mb = len(content) / (1024 ** 2)
        compressed_size_mb = len(compressed_pdf) / (1024 ** 2)
        compression_ratio = PDFStorage.get_compression_ratio(len(content), len(compressed_pdf))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comprimir PDF: {str(e)}")

    # Save PDF with standardized filename for reference only
    invoice_id = str(uuid.uuid4())
    sanitized_proveedor = sanitize_filename(nombre_proveedor)
    pdf_filename = f"FACGP_{folio_fiscal}_{sanitized_proveedor}.pdf"

    now = datetime.now(timezone.utc).isoformat()

    try:
        invoice_obj = Invoice(
            id=invoice_id,
            nombre_proveedor=nombre_proveedor,
            descripcion_factura=descripcion_factura,
            area_procedencia=area_procedencia,
            monto=monto,
            fecha_vencimiento=fecha_vencimiento,
            folio_fiscal=folio_fiscal,
            estatus=InvoiceStatusEnum.CAPTURADA.value,
            pdf_url=f"/api/invoices/{invoice_id}/download-pdf",
            pdf_data=compressed_pdf,
            comprobante_pago_url=None,
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
        log_movement(db, invoice_id, current_user.id, "", InvoiceStatusEnum.CAPTURADA.value)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear factura: {str(e)}")

    area_obj = db.query(Area).filter(Area.id == area_procedencia).first()

    return InvoiceResponse(
        id=invoice_id,
        nombre_proveedor=nombre_proveedor,
        descripcion_factura=descripcion_factura,
        area_procedencia=area_procedencia,
        area_nombre=area_obj.nombre if area_obj else None,
        monto=monto,
        fecha_vencimiento=fecha_vencimiento,
        folio_fiscal=folio_fiscal,
        estatus=InvoiceStatusEnum.CAPTURADA.value,
        pdf_url=f"/api/invoices/{invoice_id}/download-pdf",
        comprobante_pago_url=None,
        fecha_pago_real=None,
        created_by=current_user.id,
        created_by_nombre=current_user.nombre,
        created_at=now,
        updated_at=now,
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

    return [
        InvoiceResponse(
            id=inv.id,
            nombre_proveedor=inv.nombre_proveedor,
            descripcion_factura=inv.descripcion_factura,
            area_procedencia=inv.area_procedencia,
            area_nombre=areas.get(inv.area_procedencia),
            monto=inv.monto,
            fecha_vencimiento=inv.fecha_vencimiento,
            folio_fiscal=inv.folio_fiscal,
            estatus=inv.estatus,
            pdf_url=inv.pdf_url,
            comprobante_pago_url=inv.comprobante_pago_url,
            fecha_pago_real=inv.fecha_pago_real,
            created_by=inv.created_by,
            created_by_nombre=users.get(inv.created_by),
            created_at=inv.created_at.isoformat() if inv.created_at else None,
            updated_at=inv.updated_at.isoformat() if inv.updated_at else None,
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

    return InvoiceResponse(
        id=inv.id,
        nombre_proveedor=inv.nombre_proveedor,
        descripcion_factura=inv.descripcion_factura,
        area_procedencia=inv.area_procedencia,
        area_nombre=area_obj.nombre if area_obj else None,
        monto=inv.monto,
        fecha_vencimiento=inv.fecha_vencimiento,
        folio_fiscal=inv.folio_fiscal,
        estatus=inv.estatus,
        pdf_url=inv.pdf_url,
        comprobante_pago_url=inv.comprobante_pago_url,
        fecha_pago_real=inv.fecha_pago_real,
        created_by=inv.created_by,
        created_by_nombre=user_obj.nombre if user_obj else None,
        created_at=inv.created_at.isoformat() if inv.created_at else None,
        updated_at=inv.updated_at.isoformat() if inv.updated_at else None,
    )

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
        proof_filename = get_filename_from_url(inv.comprobante_pago_url)
        proof_path = UPLOAD_DIR / proof_filename if proof_filename else None
        if not proof_filename or not proof_path.exists():
            raise HTTPException(
                status_code=400,
                detail="No se puede cambiar a 'Pagada' sin un comprobante de pago PDF cargado.",
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
        compressed_size_mb = len(compressed_proof) / (1024 ** 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comprimir comprobante: {str(e)}")

    # Save payment proof with standardized filename for reference
    sanitized_proveedor = sanitize_filename(inv.nombre_proveedor)
    proof_filename = f"PAGP_{inv.folio_fiscal}_{sanitized_proveedor}.pdf"

    # Automatically change status to Pagada when payment proof is uploaded
    old_status = inv.estatus
    
    try:
        inv.comprobante_pago_url = f"/api/invoices/{invoice_id}/download-proof"
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
        
        # Serve decompressed PDF
        return StreamingResponse(
            BytesIO(pdf_content),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="factura_{inv.folio_fiscal}.pdf"',
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
        
        # Serve decompressed proof
        return StreamingResponse(
            BytesIO(proof_content),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="comprobante_{inv.folio_fiscal}.pdf"',
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
