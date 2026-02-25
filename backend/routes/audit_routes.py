from fastapi import APIRouter, Depends, Query
from typing import List

from database import db
from schemas.invoice_schemas import MovementHistoryResponse
from schemas.enums import RoleEnum
from services.auth_service import require_roles

router = APIRouter(prefix="/api", tags=["Audit"])

@router.get("/audit", response_model=List[MovementHistoryResponse])
async def get_audit_logs(
    limit: int = Query(100, le=500),
    current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))
):
    movements = await db.movement_history.find({}, {"_id": 0}).sort("fecha_cambio", -1).to_list(limit)
    
    users = {u["id"]: u["nombre"] for u in await db.users.find({}, {"_id": 0, "id": 1, "nombre": 1}).to_list(100)}
    invoices = {i["id"]: i["folio_fiscal"] for i in await db.invoices.find({}, {"_id": 0, "id": 1, "folio_fiscal": 1}).to_list(500)}
    
    return [
        MovementHistoryResponse(
            id=m["id"],
            factura_id=m["factura_id"],
            folio_fiscal=invoices.get(m["factura_id"]),
            usuario_id=m["usuario_id"],
            usuario_nombre=users.get(m["usuario_id"]),
            estatus_anterior=m["estatus_anterior"],
            estatus_nuevo=m["estatus_nuevo"],
            fecha_cambio=m["fecha_cambio"]
        ) for m in movements
    ]