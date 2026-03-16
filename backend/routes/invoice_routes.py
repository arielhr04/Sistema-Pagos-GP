from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
from io import BytesIO
from openpyxl import Workbook

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import (
    InvoiceResponse,
    InvoiceStatusUpdate,
)
from backend.schemas.enums import RoleEnum, InvoiceStatusEnum
from backend.services.auth_service import require_roles, get_current_user
from backend.services.pdf_storage import PDFStorage
from backend.services.invoice_service import (
    TREASURY_REVIEW_PENDING,
    TREASURY_REVIEW_DONE,
    to_iso_string,
    utc_now,
    validate_pdf_upload,
    compress_pdf_safe,
    log_movement,
    get_first_treasury_review,
    get_treasury_review_map,
    build_invoice_response,
    sanitize_filename,
)
from backend.services.invoice_document_service import (
    DOC_TYPE_INVOICE_PDF,
    DOC_TYPE_PAYMENT_PROOF,
    get_invoice_document,
    get_invoice_document_presence_map,
    has_invoice_document,
    upsert_invoice_document,
)
from backend.core.input_validation import sanitize_text, validate_iso_date, validate_uuid_value
from backend.db.session import get_db
from backend.models.invoice import Invoice
from backend.models.area import Area
from backend.models.user import User

router = APIRouter(prefix="/api", tags=["Invoices"])


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
            descripcion_factura, "descripcion_factura", max_length=1024, allow_multiline=True,
        ) or descripcion_factura
        area_procedencia = validate_uuid_value(area_procedencia, "area_procedencia", required=True) or area_procedencia
        fecha_vencimiento = validate_iso_date(fecha_vencimiento, "fecha_vencimiento", required=True) or fecha_vencimiento
        folio_fiscal = sanitize_text(folio_fiscal, "folio_fiscal", max_length=255) or folio_fiscal
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Validar PDF (tamaño, extensión, vacío)
    content = validate_pdf_upload(pdf_file)

    # Folio duplicado
    existing = db.query(Invoice).filter(Invoice.folio_fiscal == folio_fiscal).first()
    if existing:
        raise HTTPException(status_code=400, detail="El folio fiscal ya existe")

    compressed_pdf = compress_pdf_safe(content, "PDF de factura")
    now = utc_now()

    try:
        invoice_obj = Invoice(
            nombre_proveedor=nombre_proveedor,
            descripcion_factura=descripcion_factura,
            area_procedencia=area_procedencia,
            monto=monto,
            fecha_vencimiento=fecha_vencimiento,
            folio_fiscal=folio_fiscal,
            estatus=InvoiceStatusEnum.CAPTURADA.value,
            fecha_pago_real=None,
            created_by=current_user.id,
            created_at=now,
            updated_at=now,
        )
        db.add(invoice_obj)
        db.flush()
        upsert_invoice_document(db, invoice_obj.id, DOC_TYPE_INVOICE_PDF, compressed_pdf)
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

@router.get("/invoices")
def get_invoices(
    estatus: Optional[str] = None,
    area: Optional[str] = None,
    created_by: Optional[str] = None,
    search: Optional[str] = None,
    monto_min: Optional[float] = Query(None, description="Monto mínimo"),
    monto_max: Optional[float] = Query(None, description="Monto máximo"),
    fecha_desde: Optional[str] = Query(None, description="Fecha vencimiento desde (YYYY-MM-DD)"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha vencimiento hasta (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(20, ge=1, le=100, description="Registros por página"),
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
    if created_by:
        query = query.filter(Invoice.created_by == created_by)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Invoice.nombre_proveedor.ilike(pattern)
            | Invoice.folio_fiscal.ilike(pattern)
            | Invoice.descripcion_factura.ilike(pattern)
        )
    if monto_min is not None:
        query = query.filter(Invoice.monto >= monto_min)
    if monto_max is not None:
        query = query.filter(Invoice.monto <= monto_max)
    if fecha_desde:
        query = query.filter(Invoice.fecha_vencimiento >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Invoice.fecha_vencimiento <= fecha_hasta)

    # Total para paginación
    total = query.count()
    total_pages = max(1, (total + limit - 1) // limit)

    # Paginación
    offset = (page - 1) * limit
    invoices = query.order_by(Invoice.created_at.desc()).offset(offset).limit(limit).all()

    areas = {a.id: a.nombre for a in db.query(Area).all()}
    users = {u.id: u.nombre for u in db.query(User).all()}

    review_dates = get_treasury_review_map(db, [inv.id for inv in invoices])
    proof_invoice_ids = get_invoice_document_presence_map(
        db,
        [inv.id for inv in invoices],
        DOC_TYPE_PAYMENT_PROOF,
    )

    items = [
        build_invoice_response(
            inv,
            area_nombre=areas.get(inv.area_procedencia),
            created_by_nombre=users.get(inv.created_by),
            fecha_revision_tesoreria=review_dates.get(inv.id),
            comprobante_pago_subido=inv.id in proof_invoice_ids,
        )
        for inv in invoices
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }

@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    area_obj = db.query(Area).filter(Area.id == inv.area_procedencia).first()
    user_obj = db.query(User).filter(User.id == inv.created_by).first()

    treasury_review = get_first_treasury_review(db, invoice_id)
    proof_uploaded = has_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF) or bool(inv.comprobante_pago_data)

    return build_invoice_response(
        inv,
        area_nombre=area_obj.nombre if area_obj else None,
        created_by_nombre=user_obj.nombre if user_obj else None,
        fecha_revision_tesoreria=to_iso_string(treasury_review.fecha_cambio) if treasury_review else None,
        comprobante_pago_subido=proof_uploaded,
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

    content = validate_pdf_upload(pdf_file)
    compressed_pdf = compress_pdf_safe(content, "PDF de factura")

    try:
        upsert_invoice_document(db, invoice_id, DOC_TYPE_INVOICE_PDF, compressed_pdf)
        inv.pdf_data = None
        inv.updated_at = utc_now()
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
        has_payment_proof = has_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF) or bool(inv.comprobante_pago_data)
        if not has_payment_proof:
            raise HTTPException(
                status_code=400,
                detail="Error: Se necesita subir un comprobante de pago",
            )

    try:
        inv.estatus = new_status
        inv.updated_at = utc_now()
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

    content = validate_pdf_upload(proof_file)
    compressed_proof = compress_pdf_safe(content, "comprobante de pago")

    # Cambiar automáticamente a Pagada al subir comprobante
    old_status = inv.estatus

    try:
        upsert_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF, compressed_proof)
        inv.comprobante_pago_data = None
        inv.estatus = InvoiceStatusEnum.PAGADA.value
        inv.updated_at = utc_now()
        if not inv.fecha_pago_real:
            inv.fecha_pago_real = utc_now().date().isoformat()
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
    if not inv:
        raise HTTPException(status_code=404, detail="PDF de factura no encontrado")

    doc = get_invoice_document(db, invoice_id, DOC_TYPE_INVOICE_PDF)

    if not doc and inv.pdf_data:
        try:
            upsert_invoice_document(db, invoice_id, DOC_TYPE_INVOICE_PDF, inv.pdf_data)
            inv.pdf_data = None
            db.commit()
            doc = get_invoice_document(db, invoice_id, DOC_TYPE_INVOICE_PDF)
        except Exception:
            db.rollback()

    if not doc:
        raise HTTPException(status_code=404, detail="PDF de factura no encontrado")
    
    try:
        # Decompress PDF from database
        pdf_content = PDFStorage.decompress_pdf(doc.file_data)
        
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
    if not inv:
        raise HTTPException(status_code=404, detail="Comprobante de pago no encontrado")

    doc = get_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF)

    if not doc and inv.comprobante_pago_data:
        try:
            upsert_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF, inv.comprobante_pago_data)
            inv.comprobante_pago_data = None
            db.commit()
            doc = get_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF)
        except Exception:
            db.rollback()

    if not doc:
        raise HTTPException(status_code=404, detail="Comprobante de pago no encontrado")
    
    try:
        # Decompress proof from database
        proof_content = PDFStorage.decompress_pdf(doc.file_data)
        
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
    created_by: Optional[str] = None,
    search: Optional[str] = None,
    monto_min: Optional[float] = None,
    monto_max: Optional[float] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
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
    if created_by:
        query = query.filter(Invoice.created_by == created_by)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Invoice.nombre_proveedor.ilike(pattern)
            | Invoice.folio_fiscal.ilike(pattern)
            | Invoice.descripcion_factura.ilike(pattern)
        )
    if monto_min is not None:
        query = query.filter(Invoice.monto >= monto_min)
    if monto_max is not None:
        query = query.filter(Invoice.monto <= monto_max)
    if fecha_desde:
        query = query.filter(Invoice.fecha_vencimiento >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Invoice.fecha_vencimiento <= fecha_hasta)
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
