from fastapi import APIRouter, Depends, Query
from typing import List

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import MovementHistoryResponse
from backend.schemas.enums import RoleEnum
from backend.services.auth_service import require_roles
from backend.db.session import get_db
from backend.models.movement import MovementHistory
from backend.models.user import User
from backend.models.invoice import Invoice

router = APIRouter(prefix="/api", tags=["Audit"])

@router.get("/audit", response_model=List[MovementHistoryResponse])
def get_audit_logs(
    limit: int = Query(100, le=500),
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    movements = (
        db.query(MovementHistory)
        .order_by(MovementHistory.fecha_cambio.desc())
        .limit(limit)
        .all()
    )

    users_map = {u.id: u.nombre for u in db.query(User).limit(100).all()}
    invoices_map = {i.id: i.folio_fiscal for i in db.query(Invoice).limit(500).all()}

    return [
        MovementHistoryResponse(
            id=m.id,
            factura_id=m.factura_id,
            folio_fiscal=invoices_map.get(m.factura_id),
            usuario_id=m.usuario_id,
            usuario_nombre=users_map.get(m.usuario_id),
            estatus_anterior=m.estatus_anterior,
            estatus_nuevo=m.estatus_nuevo,
            fecha_cambio=m.fecha_cambio.isoformat() if m.fecha_cambio else None,
        )
        for m in movements
    ]