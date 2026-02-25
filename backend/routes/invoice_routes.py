from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import aiofiles
from io import BytesIO

from database import db
from schemas.invoice_schemas import (
    InvoiceResponse,
    InvoiceStatusUpdate,
    MovementHistoryResponse,
)
from schemas.enums import RoleEnum, InvoiceStatusEnum
from services.auth_service import require_roles, get_current_user

from pathlib import Path
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)



router = APIRouter(prefix="/api", tags=["Invoices"])

@router.post("/invoices", response_model=InvoiceResponse)
async def create_invoice(
    nombre_proveedor: str = Form(...),
    descripcion_factura: str = Form(...),
    area_procedencia: str = Form(...),
    monto: float = Form(...),
    fecha_vencimiento: str = Form(...),
    folio_fiscal: str = Form(...),
    pdf_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # Validate PDF
    if not pdf_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
    
    # Check file size (max 10MB)
    content = await pdf_file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")
    
    # Check duplicate folio
    existing = await db.invoices.find_one({"folio_fiscal": folio_fiscal})
    if existing:
        raise HTTPException(status_code=400, detail="El folio fiscal ya existe")
    
    # Save PDF
    invoice_id = str(uuid.uuid4())
    pdf_filename = f"{invoice_id}_{pdf_file.filename}"
    pdf_path = UPLOAD_DIR / pdf_filename
    
    async with aiofiles.open(pdf_path, 'wb') as f:
        await f.write(content)
    
    now = datetime.now(timezone.utc).isoformat()
    
    invoice_doc = {
        "id": invoice_id,
        "nombre_proveedor": nombre_proveedor,
        "descripcion_factura": descripcion_factura,
        "area_procedencia": area_procedencia,
        "monto": monto,
        "fecha_vencimiento": fecha_vencimiento,
        "folio_fiscal": folio_fiscal,
        "estatus": InvoiceStatusEnum.CAPTURADA.value,
        "pdf_url": f"/api/files/{pdf_filename}",
        "comprobante_pago_url": None,
        "fecha_pago_real": None,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now
    }
    
    await db.invoices.insert_one(invoice_doc)
    
    # Log movement
    await log_movement(invoice_id, current_user["id"], "", InvoiceStatusEnum.CAPTURADA.value)
    
    area = await db.areas.find_one({"id": area_procedencia}, {"_id": 0})
    
    return InvoiceResponse(
        id=invoice_id,
        nombre_proveedor=nombre_proveedor,
        descripcion_factura=descripcion_factura,
        area_procedencia=area_procedencia,
        area_nombre=area["nombre"] if area else None,
        monto=monto,
        fecha_vencimiento=fecha_vencimiento,
        folio_fiscal=folio_fiscal,
        estatus=InvoiceStatusEnum.CAPTURADA.value,
        pdf_url=f"/api/files/{pdf_filename}",
        comprobante_pago_url=None,
        fecha_pago_real=None,
        created_by=current_user["id"],
        created_by_nombre=current_user["nombre"],
        created_at=now,
        updated_at=now
    )

@router.get("/invoices", response_model=List[InvoiceResponse])
async def get_invoices(
    estatus: Optional[str] = None,
    area: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Filter by role - Usuario Área only sees their own invoices
    if current_user["rol"] == RoleEnum.USUARIO_AREA.value:
        query["created_by"] = current_user["id"]
    
    if estatus:
        query["estatus"] = estatus
    if area:
        query["area_procedencia"] = area
    if search:
        query["$or"] = [
            {"nombre_proveedor": {"$regex": search, "$options": "i"}},
            {"folio_fiscal": {"$regex": search, "$options": "i"}},
            {"descripcion_factura": {"$regex": search, "$options": "i"}}
        ]
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    # Get areas and users for names (optimized projections)
    areas = {a["id"]: a["nombre"] for a in await db.areas.find({}, {"_id": 0, "id": 1, "nombre": 1}).to_list(50)}
    users = {u["id"]: u["nombre"] for u in await db.users.find({}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)}
    
    return [
        InvoiceResponse(
            id=inv["id"],
            nombre_proveedor=inv["nombre_proveedor"],
            descripcion_factura=inv["descripcion_factura"],
            area_procedencia=inv["area_procedencia"],
            area_nombre=areas.get(inv["area_procedencia"]),
            monto=inv["monto"],
            fecha_vencimiento=inv["fecha_vencimiento"],
            folio_fiscal=inv["folio_fiscal"],
            estatus=inv["estatus"],
            pdf_url=inv.get("pdf_url"),
            comprobante_pago_url=inv.get("comprobante_pago_url"),
            fecha_pago_real=inv.get("fecha_pago_real"),
            created_by=inv["created_by"],
            created_by_nombre=users.get(inv["created_by"]),
            created_at=inv["created_at"],
            updated_at=inv["updated_at"]
        ) for inv in invoices
    ]

@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    area = await db.areas.find_one({"id": invoice["area_procedencia"]}, {"_id": 0})
    user = await db.users.find_one({"id": invoice["created_by"]}, {"_id": 0, "password": 0})
    
    return InvoiceResponse(
        id=invoice["id"],
        nombre_proveedor=invoice["nombre_proveedor"],
        descripcion_factura=invoice["descripcion_factura"],
        area_procedencia=invoice["area_procedencia"],
        area_nombre=area["nombre"] if area else None,
        monto=invoice["monto"],
        fecha_vencimiento=invoice["fecha_vencimiento"],
        folio_fiscal=invoice["folio_fiscal"],
        estatus=invoice["estatus"],
        pdf_url=invoice.get("pdf_url"),
        comprobante_pago_url=invoice.get("comprobante_pago_url"),
        fecha_pago_real=invoice.get("fecha_pago_real"),
        created_by=invoice["created_by"],
        created_by_nombre=user["nombre"] if user else None,
        created_at=invoice["created_at"],
        updated_at=invoice["updated_at"]
    )

@router.put("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: str,
    status_update: InvoiceStatusUpdate,
    current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO))
):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    old_status = invoice["estatus"]
    new_status = status_update.nuevo_estatus.value
    
    update_dict = {
        "estatus": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if status_update.fecha_pago_real:
        update_dict["fecha_pago_real"] = status_update.fecha_pago_real
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_dict})
    
    # Log movement
    await log_movement(invoice_id, current_user["id"], old_status, new_status)
    
    return await get_invoice(invoice_id, current_user)

@router.post("/invoices/{invoice_id}/payment-proof", response_model=InvoiceResponse)
async def upload_payment_proof(
    invoice_id: str,
    proof_file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO))
):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if not proof_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
    
    content = await proof_file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo no puede superar 10MB")
    
    proof_filename = f"proof_{invoice_id}_{proof_file.filename}"
    proof_path = UPLOAD_DIR / proof_filename
    
    async with aiofiles.open(proof_path, 'wb') as f:
        await f.write(content)
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "comprobante_pago_url": f"/api/files/{proof_filename}",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return await get_invoice(invoice_id, current_user)

@router.get("/files/{filename}")
async def get_file(filename: str, current_user: dict = Depends(get_current_user)):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    
    async with aiofiles.open(file_path, 'rb') as f:
        content = await f.read()
    
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )



# Export Excel
@router.get("/invoices/export/excel")
async def export_invoices_excel(current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    invoices = await db.invoices.find({}, {"_id": 0, "folio_fiscal": 1, "nombre_proveedor": 1, "descripcion_factura": 1, "area_procedencia": 1, "monto": 1, "fecha_vencimiento": 1, "estatus": 1, "created_at": 1}).to_list(1000)
    areas = {a["id"]: a["nombre"] for a in await db.areas.find({}, {"_id": 0, "id": 1, "nombre": 1}).to_list(50)}
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Facturas"
    
    # Headers
    headers = ["Folio Fiscal", "Proveedor", "Descripción", "Área", "Monto", "Fecha Vencimiento", "Estatus", "Fecha Creación"]
    header_fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
    
    # Data
    for row, inv in enumerate(invoices, 2):
        ws.cell(row=row, column=1, value=inv["folio_fiscal"])
        ws.cell(row=row, column=2, value=inv["nombre_proveedor"])
        ws.cell(row=row, column=3, value=inv["descripcion_factura"])
        ws.cell(row=row, column=4, value=areas.get(inv["area_procedencia"], ""))
        ws.cell(row=row, column=5, value=inv["monto"])
        ws.cell(row=row, column=6, value=inv["fecha_vencimiento"][:10])
        ws.cell(row=row, column=7, value=inv["estatus"])
        ws.cell(row=row, column=8, value=inv["created_at"][:10])
    
    # Auto-width
    for col in ws.columns:
        max_length = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 50)
    
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=facturas_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )
