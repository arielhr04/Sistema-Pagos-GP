from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from sqlalchemy import func, case, literal_column
from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import DashboardStats
from backend.schemas.enums import RoleEnum, InvoiceStatusEnum
from backend.services.auth_service import require_roles
from backend.db.session import get_db
from backend.models.invoice import Invoice
from backend.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# Estatus que se consideran pendientes (no pagada, no rechazada)
_ACTIVE_STATUSES = [
    s.value for s in InvoiceStatusEnum
    if s not in (InvoiceStatusEnum.PAGADA, InvoiceStatusEnum.RECHAZADA)
]


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO)),
    db: Session = Depends(get_db),
):
    """Estadísticas del dashboard — cálculos al nivel de SQL."""
    today = datetime.now(timezone.utc).date().isoformat()

    # ── Conteos y monto agregados por SQL ──────────────────────────
    total_pagadas = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.estatus == InvoiceStatusEnum.PAGADA.value)
        .scalar() or 0
    )

    # Facturas activas (no pagadas/rechazadas): conteo + monto
    active_q = db.query(
        func.count(Invoice.id).label("cnt"),
        func.coalesce(func.sum(Invoice.monto), 0).label("monto"),
    ).filter(Invoice.estatus.in_(_ACTIVE_STATUSES)).first()

    total_pendientes = active_q.cnt if active_q else 0
    monto_total = float(active_q.monto) if active_q else 0.0

    # Vencidas y por vencer requieren comparar fecha — cargar solo activas
    active_invoices = (
        db.query(Invoice.fecha_vencimiento)
        .filter(Invoice.estatus.in_(_ACTIVE_STATUSES))
        .all()
    )

    total_vencidas = 0
    total_por_vencer = 0
    for (fecha_venc_raw,) in active_invoices:
        try:
            days_diff = (datetime.fromisoformat(fecha_venc_raw[:10]) - datetime.fromisoformat(today)).days
            if days_diff < 0:
                total_vencidas += 1
            elif days_diff <= 10:
                total_por_vencer += 1
        except (ValueError, TypeError):
            continue

    # ── Facturas por estatus ───────────────────────────────────────
    status_rows = (
        db.query(Invoice.estatus, func.count(Invoice.id))
        .group_by(Invoice.estatus)
        .all()
    )
    facturas_por_estatus = [
        {"estatus": estatus, "cantidad": cnt}
        for estatus, cnt in status_rows if cnt > 0
    ]

    # ── Facturas por mes (últimos 12 meses) ────────────────────────
    # Extraer YYYY-MM a nivel de Python porque fecha se guarda como datetime
    monthly_rows = (
        db.query(Invoice.created_at, Invoice.monto)
        .order_by(Invoice.created_at.desc())
        .all()
    )
    monthly_data: dict = {}
    for created_at, monto in monthly_rows:
        month_key = created_at.isoformat()[:7] if created_at else None
        if not month_key:
            continue
        if month_key not in monthly_data:
            monthly_data[month_key] = {"mes": month_key, "cantidad": 0, "monto": 0.0}
        monthly_data[month_key]["cantidad"] += 1
        monthly_data[month_key]["monto"] += monto

    facturas_por_mes = sorted(monthly_data.values(), key=lambda x: x["mes"])[-12:]

    return DashboardStats(
        total_pendientes=total_pendientes,
        total_por_vencer=total_por_vencer,
        total_vencidas=total_vencidas,
        total_pagadas=total_pagadas,
        monto_total_comprometido=monto_total,
        facturas_por_mes=facturas_por_mes,
        facturas_por_estatus=facturas_por_estatus,
    )
