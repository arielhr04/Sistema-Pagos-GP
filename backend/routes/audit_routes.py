from fastapi import APIRouter, Depends, Query
from typing import List
from datetime import timezone

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import MovementHistoryResponse
from backend.schemas.enums import RoleEnum
from backend.services.auth_service import require_roles
from backend.db.session import get_db
from backend.models.movement import MovementHistory
from backend.models.user import User
from backend.models.invoice import Invoice

router = APIRouter(prefix="/api", tags=["Audit"])


def _to_utc_iso(dt):
    """Convertir datetime a ISO 8601 UTC."""
    if not dt:
        return None
    normalized = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return normalized.astimezone(timezone.utc).isoformat()


@router.get("/audit", response_model=List[MovementHistoryResponse])
def get_audit_logs(
    limit: int = Query(100, le=500),
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    """Historial de movimientos — solo carga usuarios/facturas referenciados."""
    movements = (
        db.query(MovementHistory)
        .order_by(MovementHistory.fecha_cambio.desc())
        .limit(limit)
        .all()
    )

    # Solo buscar los IDs que aparecen en el resultado (evita cargar toda la tabla)
    user_ids = {m.usuario_id for m in movements if m.usuario_id}
    invoice_ids = {m.factura_id for m in movements if m.factura_id}

    users_map = (
        {u.id: u.nombre for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids else {}
    )
    invoices_map = (
        {i.id: i.folio_fiscal for i in db.query(Invoice).filter(Invoice.id.in_(invoice_ids)).all()}
        if invoice_ids else {}
    )

    return [
        MovementHistoryResponse(
            id=m.id,
            factura_id=m.factura_id,
            folio_fiscal=invoices_map.get(m.factura_id),
            usuario_id=m.usuario_id,
            usuario_nombre=users_map.get(m.usuario_id),
            estatus_anterior=m.estatus_anterior,
            estatus_nuevo=m.estatus_nuevo,
            fecha_cambio=_to_utc_iso(m.fecha_cambio),
        )
        for m in movements
    ]