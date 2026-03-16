"""Notificaciones — cambios recientes en facturas relevantes para el usuario."""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from backend.services.auth_service import get_current_user
from backend.schemas.enums import RoleEnum
from backend.db.session import get_db
from backend.models.invoice import Invoice
from backend.models.movement import MovementHistory
from backend.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def get_notifications(
    since: Optional[str] = Query(None, description="ISO datetime — solo cambios después de esta fecha"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna cambios de estatus recientes relevantes para el usuario.
    - Administradores/Tesoreros: ven todos los cambios
    - Usuario Área: solo ve cambios en SUS facturas
    """
    # Por defecto, últimas 24h
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = datetime.now(timezone.utc) - timedelta(hours=24)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(hours=24)

    query = (
        db.query(MovementHistory)
        .filter(MovementHistory.fecha_cambio >= since_dt)
        .filter(MovementHistory.usuario_id != current_user.id)  # No notificar de mis propios cambios
    )

    # Usuario Área solo ve sus facturas
    if current_user.rol == RoleEnum.USUARIO_AREA.value:
        my_invoice_ids = [
            inv_id for (inv_id,) in
            db.query(Invoice.id).filter(Invoice.created_by == current_user.id).all()
        ]
        query = query.filter(MovementHistory.factura_id.in_(my_invoice_ids))

    movements = query.order_by(MovementHistory.fecha_cambio.desc()).limit(50).all()

    if not movements:
        return {"items": [], "count": 0}

    # Resolver nombres
    user_ids = list({m.usuario_id for m in movements})
    invoice_ids = list({m.factura_id for m in movements})

    users_map = {u.id: u.nombre for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    invoices_map = {
        inv.id: {"folio": inv.folio_fiscal, "proveedor": inv.nombre_proveedor}
        for inv in db.query(Invoice).filter(Invoice.id.in_(invoice_ids)).all()
    }

    items = []
    for m in movements:
        inv_info = invoices_map.get(m.factura_id, {})
        items.append({
            "id": m.id,
            "factura_id": m.factura_id,
            "folio_fiscal": inv_info.get("folio", ""),
            "proveedor": inv_info.get("proveedor", ""),
            "usuario_nombre": users_map.get(m.usuario_id, "Sistema"),
            "estatus_anterior": m.estatus_anterior,
            "estatus_nuevo": m.estatus_nuevo,
            "fecha": m.fecha_cambio.isoformat() if m.fecha_cambio else "",
        })

    return {"items": items, "count": len(items)}
