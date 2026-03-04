from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from typing import List

from sqlalchemy.orm import Session

from backend.schemas.invoice_schemas import DashboardStats
from backend.schemas.enums import RoleEnum, InvoiceStatusEnum
from backend.services.auth_service import require_roles
from backend.db.session import get_db
from backend.models.invoice import Invoice

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: Invoice = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO)), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()

    invoices = db.query(Invoice).with_entities(
        Invoice.estatus,
        Invoice.monto,
        Invoice.fecha_vencimiento,
        Invoice.created_at,
    ).limit(1000).all()

    total_pendientes = 0
    total_por_vencer = 0
    total_vencidas = 0
    total_pagadas = 0
    monto_total = 0

    status_counts = {s.value: 0 for s in InvoiceStatusEnum}
    monthly_data = {}

    for inv in invoices:
        status_counts[inv.estatus] = status_counts.get(inv.estatus, 0) + 1

        if inv.estatus == InvoiceStatusEnum.PAGADA.value:
            total_pagadas += 1
        else:
            monto_total += inv.monto

            if inv.estatus not in [InvoiceStatusEnum.PAGADA.value, InvoiceStatusEnum.RECHAZADA.value]:
                total_pendientes += 1

                fecha_venc = inv.fecha_vencimiento[:10]
                days_diff = (datetime.fromisoformat(fecha_venc) - datetime.fromisoformat(today)).days

                if days_diff < 0:
                    total_vencidas += 1
                elif days_diff <= 10:
                    total_por_vencer += 1

        # inv.created_at may be a datetime object; convert to ISO string first
        month_key = inv.created_at.isoformat()[:7]
        if month_key not in monthly_data:
            monthly_data[month_key] = {"mes": month_key, "cantidad": 0, "monto": 0}
        monthly_data[month_key]["cantidad"] += 1
        monthly_data[month_key]["monto"] += inv.monto

    facturas_por_mes = sorted(monthly_data.values(), key=lambda x: x["mes"])[-12:]
    facturas_por_estatus = [{"estatus": k, "cantidad": v} for k, v in status_counts.items() if v > 0]

    return DashboardStats(
        total_pendientes=total_pendientes,
        total_por_vencer=total_por_vencer,
        total_vencidas=total_vencidas,
        total_pagadas=total_pagadas,
        monto_total_comprometido=monto_total,
        facturas_por_mes=facturas_por_mes,
        facturas_por_estatus=facturas_por_estatus,
    )
