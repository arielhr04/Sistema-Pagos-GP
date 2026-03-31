from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
from io import BytesIO
from openpyxl import Workbook
import logging

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import (
    InvoiceResponse,
    InvoiceStatusUpdate,
)
from backend.schemas.enums import RoleEnum, InvoiceStatusEnum
from backend.services.auth_service import require_roles, get_current_user
from backend.services.xml_service import extract_invoice_data_from_xml
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
from backend.models.supervisor_empresa import SupervisorEmpresa

router = APIRouter(prefix="/api", tags=["Invoices"])
logger = logging.getLogger(__name__)


@router.post("/invoices", response_model=InvoiceResponse)
def create_invoice(
    nombre_proveedor: str = Form(...),
    descripcion_factura: str = Form(...),
    monto: float = Form(...),
    fecha_vencimiento: str = Form(...),
    folio_fiscal: str = Form(...),
    requiere_autorizacion: bool = Form(default=False),
    pdf_file: UploadFile = File(...),
    xml_file: Optional[UploadFile] = File(None),
    empresa_id: Optional[str] = Form(None),  # Para supervisores: empresa específica
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        nombre_proveedor = sanitize_text(nombre_proveedor, "nombre_proveedor", max_length=255) or nombre_proveedor
        descripcion_factura = sanitize_text(
            descripcion_factura, "descripcion_factura", max_length=1024, allow_multiline=True,
        ) or descripcion_factura
        fecha_vencimiento = validate_iso_date(fecha_vencimiento, "fecha_vencimiento", required=True) or fecha_vencimiento
        folio_fiscal = sanitize_text(folio_fiscal, "folio_fiscal", max_length=255) or folio_fiscal
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Determinar la empresa a usar según el rol del usuario
    if current_user.rol == RoleEnum.SUPERVISOR.value:
        # Supervisor debe especificar una empresa
        if not empresa_id:
            raise HTTPException(status_code=400, detail="Supervisor debe especificar una empresa")
        
        # Validar que el supervisor tiene asignada esa empresa
        supervisor_empresa = db.query(SupervisorEmpresa).filter(
            SupervisorEmpresa.supervisor_id == current_user.id,
            SupervisorEmpresa.empresa_id == empresa_id
        ).first()
        
        if not supervisor_empresa:
            raise HTTPException(status_code=403, detail="El supervisor no tiene asignada esa empresa")
        
        target_empresa_id = empresa_id
    else:
        # Usuario Área o Admin: usar su empresa asignada
        if not current_user.empresa_id:
            raise HTTPException(status_code=403, detail="El usuario no tiene empresa asignada")
        target_empresa_id = current_user.empresa_id

    # Validar PDF (tamaño, extensión, vacío) - requerido
    content = validate_pdf_upload(pdf_file)
    
    # Procesar XML opcional si se proporciona
    if xml_file:
        try:
            xml_content = xml_file.file.read()
            if not xml_content:
                raise HTTPException(status_code=400, detail="El archivo XML está vacío")
            if len(xml_content) > 5 * 1024 * 1024:  # 5 MB limit
                raise HTTPException(status_code=413, detail="El archivo XML es demasiado grande (máximo 5 MB)")
            
            # Extraer datos del XML
            xml_data = extract_invoice_data_from_xml(xml_content)
            
            # Usar datos del XML para llenar campos faltantes
            if xml_data:
                if not nombre_proveedor or nombre_proveedor == '':
                    nombre_proveedor = xml_data.get('razon_social') or nombre_proveedor
                if not monto or monto == 0:
                    monto_str = xml_data.get('total')
                    if monto_str:
                        try:
                            monto = float(monto_str)
                        except (ValueError, TypeError):
                            pass
                if not folio_fiscal or folio_fiscal == '':
                    folio_fiscal = xml_data.get('folio_fiscal') or folio_fiscal
                if not fecha_vencimiento or fecha_vencimiento == '':
                    fecha_emision = xml_data.get('fecha_emision')
                    if fecha_emision:
                        fecha_vencimiento = fecha_emision
                if not descripcion_factura or descripcion_factura == '':
                    descripcion_factura = xml_data.get('descripcion_factura') or descripcion_factura
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Error procesando XML: {str(e)}")
        except Exception as e:
            logger.error(f"Error procesando XML: {str(e)}")
            raise HTTPException(status_code=500, detail="Error al procesar el archivo XML")

    # Folio duplicado
    existing = db.query(Invoice).filter(Invoice.folio_fiscal == folio_fiscal).first()
    if existing:
        raise HTTPException(status_code=400, detail="El folio fiscal ya existe")

    compressed_pdf = compress_pdf_safe(content, "PDF de factura")
    now = utc_now()

    # Determinar estado inicial según requiere_autorizacion
    estado_inicial = (
        InvoiceStatusEnum.PENDIENTE_AUTORIZACION.value
        if requiere_autorizacion
        else InvoiceStatusEnum.CAPTURADA.value
    )

    try:
        invoice_obj = Invoice(
            nombre_proveedor=nombre_proveedor,
            descripcion_factura=descripcion_factura,
            empresa_factura=target_empresa_id,
            monto=monto,
            fecha_vencimiento=fecha_vencimiento,
            folio_fiscal=folio_fiscal,
            estatus=estado_inicial,
            requiere_autorizacion=requiere_autorizacion,
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
        log_movement(db, invoice_obj.id, current_user.id, "", estado_inicial)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear factura: {str(e)}")

    empresa_obj = db.query(Area).filter(Area.id == invoice_obj.empresa_factura).first()

    return build_invoice_response(
        invoice_obj,
        empresa_nombre=empresa_obj.nombre if empresa_obj else None,
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
    elif current_user.rol == RoleEnum.SUPERVISOR.value:
        supervisor_empresas = db.query(SupervisorEmpresa).filter(
            SupervisorEmpresa.supervisor_id == current_user.id
        ).all()
        empresa_ids = [se.empresa_id for se in supervisor_empresas]
        if not empresa_ids:
            return {
                "items": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "total_pages": 1,
            }
        query = query.filter(Invoice.empresa_factura.in_(empresa_ids))
    if estatus:
        query = query.filter(Invoice.estatus == estatus)
    if area:
        query = query.filter(Invoice.empresa_factura == area)
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

    empresa_ids = {inv.empresa_factura for inv in invoices if inv.empresa_factura}
    creator_ids = {inv.created_by for inv in invoices if inv.created_by}
    areas = (
        {a.id: a.nombre for a in db.query(Area).filter(Area.id.in_(empresa_ids)).all()}
        if empresa_ids
        else {}
    )
    users = (
        {u.id: u.nombre for u in db.query(User).filter(User.id.in_(creator_ids)).all()}
        if creator_ids
        else {}
    )

    review_dates = get_treasury_review_map(db, [inv.id for inv in invoices])
    proof_invoice_ids = get_invoice_document_presence_map(
        db,
        [inv.id for inv in invoices],
        DOC_TYPE_PAYMENT_PROOF,
    )

    items = [
        build_invoice_response(
            inv,
            empresa_nombre=areas.get(inv.empresa_factura),
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

    if current_user.rol == RoleEnum.USUARIO_AREA.value and inv.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No tiene permisos para ver esta factura")

    if current_user.rol == RoleEnum.SUPERVISOR.value:
        supervisor_empresa = db.query(SupervisorEmpresa).filter(
            SupervisorEmpresa.supervisor_id == current_user.id,
            SupervisorEmpresa.empresa_id == inv.empresa_factura,
        ).first()
        if not supervisor_empresa:
            raise HTTPException(status_code=403, detail="No tiene permisos para ver esta factura")

    empresa_obj = db.query(Area).filter(Area.id == inv.empresa_factura).first()
    user_obj = db.query(User).filter(User.id == inv.created_by).first()

    treasury_review = get_first_treasury_review(db, invoice_id)
    proof_uploaded = has_invoice_document(db, invoice_id, DOC_TYPE_PAYMENT_PROOF) or bool(inv.comprobante_pago_data)

    return build_invoice_response(
        inv,
        empresa_nombre=empresa_obj.nombre if empresa_obj else None,
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
        query = query.filter(Invoice.empresa_factura == area)
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
            areas.get(inv.empresa_factura),
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


@router.post("/invoices/extract-xml")
def extract_invoice_xml(
    xml_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Extrae datos de factura desde un archivo XML CFDI.
    Retorna: razon_social, total, folio_fiscal, fecha_emision, descripcion_factura
    """
    try:
        content = xml_file.file.read()

        if not content:
            raise HTTPException(status_code=400, detail="El archivo XML está vacío")

        if len(content) > 5 * 1024 * 1024:  # 5 MB limit
            raise HTTPException(status_code=413, detail="El archivo XML es demasiado grande (máximo 5 MB)")

        extracted_data = extract_invoice_data_from_xml(content)

        return {
            "success": True,
            "data": extracted_data,
            "message": "Datos extraídos correctamente del XML CFDI"
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Error procesando XML: {str(e)}")
        raise HTTPException(status_code=500, detail="Error al procesar el archivo XML")


@router.post("/invoices/{invoice_id}/supervisor/approve", response_model=InvoiceResponse)
def supervisor_approve_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Endpoint para que un supervisor apruebe una factura.
    La factura cambia de "Pendiente de Autorización" a "Capturada"
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Validar que es "Pendiente de Autorización"
    if invoice.estatus != InvoiceStatusEnum.PENDIENTE_AUTORIZACION.value:
        raise HTTPException(
            status_code=400,
            detail=f"La factura debe estar en 'Pendiente de Autorización' para ser aprobada. Estado actual: {invoice.estatus}"
        )

    # Validar que el usuario es supervisor de esta empresa
    supervisor_check = db.query(SupervisorEmpresa).filter(
        SupervisorEmpresa.supervisor_id == current_user.id,
        SupervisorEmpresa.empresa_id == invoice.empresa_factura
    ).first()
    
    if not supervisor_check:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para aprobar facturas de esta empresa"
        )

    try:
        old_status = invoice.estatus
        invoice.estatus = InvoiceStatusEnum.CAPTURADA.value
        invoice.aprobada_por_supervisor = True
        invoice.supervisor_id = current_user.id
        invoice.fecha_aprobacion_supervisor = utc_now()
        invoice.updated_at = utc_now()
        
        db.commit()
        db.refresh(invoice)

        # Log movement
        log_movement(db, invoice_id, current_user.id, old_status, InvoiceStatusEnum.CAPTURADA.value)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al aprobar factura: {str(e)}")

    empresa_obj = db.query(Area).filter(Area.id == invoice.empresa_factura).first()
    supervisor_obj = db.query(User).filter(User.id == invoice.supervisor_id).first()

    return build_invoice_response(
        invoice,
        empresa_nombre=empresa_obj.nombre if empresa_obj else None,
        supervisor_nombre=supervisor_obj.nombre if supervisor_obj else None,
        created_by_nombre=db.query(User).filter(User.id == invoice.created_by).first().nombre,
    )


@router.post("/invoices/{invoice_id}/supervisor/reject", response_model=InvoiceResponse)
def supervisor_reject_invoice(
    invoice_id: str,
    comentario: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Endpoint para que un supervisor rechace una factura.
    La factura cambia a "Rechazada por Supervisor" y se guarda el comentario
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Validar que es "Pendiente de Autorización"
    if invoice.estatus != InvoiceStatusEnum.PENDIENTE_AUTORIZACION.value:
        raise HTTPException(
            status_code=400,
            detail=f"La factura debe estar en 'Pendiente de Autorización' para ser rechazada. Estado actual: {invoice.estatus}"
        )

    # Validar que el usuario es supervisor de esta empresa
    supervisor_check = db.query(SupervisorEmpresa).filter(
        SupervisorEmpresa.supervisor_id == current_user.id,
        SupervisorEmpresa.empresa_id == invoice.empresa_factura
    ).first()
    
    if not supervisor_check:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para rechazar facturas de esta empresa"
        )

    try:
        old_status = invoice.estatus
        invoice.estatus = InvoiceStatusEnum.RECHAZADA_SUPERVISOR.value
        invoice.supervisor_id = current_user.id
        invoice.fecha_aprobacion_supervisor = utc_now()
        invoice.updated_at = utc_now()
        
        db.commit()
        db.refresh(invoice)

        # Log movement
        log_movement(db, invoice_id, current_user.id, old_status, InvoiceStatusEnum.RECHAZADA_SUPERVISOR.value)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al rechazar factura: {str(e)}")

    empresa_obj = db.query(Area).filter(Area.id == invoice.empresa_factura).first()
    supervisor_obj = db.query(User).filter(User.id == invoice.supervisor_id).first()

    return build_invoice_response(
        invoice,
        empresa_nombre=empresa_obj.nombre if empresa_obj else None,
        supervisor_nombre=supervisor_obj.nombre if supervisor_obj else None,
        created_by_nombre=db.query(User).filter(User.id == invoice.created_by).first().nombre,
    )


@router.get("/invoices/supervisor/pending", response_model=list)
def get_supervisor_pending_invoices(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Obtiene todas las facturas pendientes de aprobación para las empresas supervisadas por el usuario.
    """
    if current_user.rol != RoleEnum.SUPERVISOR.value:
        raise HTTPException(status_code=403, detail="Solo supervisores pueden acceder")

    try:
        # Obtener las empresas que supervisa este usuario
        empresa_rows = db.query(SupervisorEmpresa.empresa_id).filter(
            SupervisorEmpresa.supervisor_id == current_user.id
        ).all()
        empresa_ids = [row[0] for row in empresa_rows if row and row[0]]

        if not empresa_ids:
            return []

        # Obtener facturas pendientes de aprobación en esas empresas
        facturas_pendientes = db.query(Invoice).filter(
            Invoice.empresa_factura.in_(empresa_ids),
            Invoice.estatus == InvoiceStatusEnum.PENDIENTE_AUTORIZACION.value
        ).order_by(Invoice.fecha_vencimiento.asc(), Invoice.created_at.asc()).offset(offset).limit(limit).all()

        # Precargar datos relacionados
        empresa_ids_set = set(empresa_ids)
        empresas = {a.id: a.nombre for a in db.query(Area).filter(Area.id.in_(empresa_ids_set)).all()}

        created_by_ids = {f.created_by for f in facturas_pendientes if f.created_by}
        usuarios = (
            {u.id: u.nombre for u in db.query(User).filter(User.id.in_(created_by_ids)).all()}
            if created_by_ids
            else {}
        )

        # Construir respuestas
        respuestas = []
        for inv in facturas_pendientes:
            respuestas.append(
                build_invoice_response(
                    inv,
                    empresa_nombre=empresas.get(inv.empresa_factura),
                    created_by_nombre=usuarios.get(inv.created_by),
                )
            )

        return respuestas
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error obteniendo facturas pendientes de supervisor: %s", e)
        raise HTTPException(status_code=500, detail="Error al obtener pendientes de supervisor")


@router.get("/invoices/supervisor/stats")
def get_supervisor_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Estadísticas para dashboard supervisor: conteos por estado.
    """
    # Obtener las empresas que supervisa
    supervisor_empresas = db.query(SupervisorEmpresa).filter(
        SupervisorEmpresa.supervisor_id == current_user.id
    ).all()
    
    if not supervisor_empresas:
        return {
            "pendientes": 0,
            "aprobadas_hoy": 0,
            "rechazadas": 0,
            "total_empresas_supervisadas": 0,
        }
    
    empresa_ids = [se.empresa_id for se in supervisor_empresas]
    
    # Contar pendientes
    pendientes = db.query(Invoice).filter(
        Invoice.empresa_factura.in_(empresa_ids),
        Invoice.estatus == InvoiceStatusEnum.PENDIENTE_AUTORIZACION.value
    ).count()
    
    # Contar aprobadas hoy
    hoy = utc_now().date().isoformat()
    aprobadas_hoy = db.query(Invoice).filter(
        Invoice.empresa_factura.in_(empresa_ids),
        Invoice.estatus == InvoiceStatusEnum.CAPTURADA.value,
        Invoice.aprobada_por_supervisor == True,
        Invoice.supervisor_id == current_user.id,
        Invoice.fecha_aprobacion_supervisor >= hoy,
    ).count()
    
    # Contar rechazadas
    rechazadas = db.query(Invoice).filter(
        Invoice.empresa_factura.in_(empresa_ids),
        Invoice.estatus == InvoiceStatusEnum.RECHAZADA_SUPERVISOR.value,
        Invoice.supervisor_id == current_user.id,
    ).count()
    
    return {
        "pendientes": pendientes,
        "aprobadas_hoy": aprobadas_hoy,
        "rechazadas": rechazadas,
        "total_empresas_supervisadas": len(empresa_ids),
    }
