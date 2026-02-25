from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from typing import List

from database import db
from schemas.invoice_schemas import DashboardStats
from schemas.enums import RoleEnum, InvoiceStatusEnum
from services.auth_service import require_roles

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR, RoleEnum.TESORERO))):
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    
    # Get invoices with only required fields
    invoices = await db.invoices.find({}, {"_id": 0, "estatus": 1, "monto": 1, "fecha_vencimiento": 1, "created_at": 1}).to_list(1000)
    
    total_pendientes = 0
    total_por_vencer = 0
    total_vencidas = 0
    total_pagadas = 0
    monto_total = 0
    
    status_counts = {s.value: 0 for s in InvoiceStatusEnum}
    monthly_data = {}
    
    for inv in invoices:
        status_counts[inv["estatus"]] = status_counts.get(inv["estatus"], 0) + 1
        
        if inv["estatus"] == InvoiceStatusEnum.PAGADA.value:
            total_pagadas += 1
        else:
            monto_total += inv["monto"]
            
            if inv["estatus"] not in [InvoiceStatusEnum.PAGADA.value, InvoiceStatusEnum.RECHAZADA.value]:
                total_pendientes += 1
                
                fecha_venc = inv["fecha_vencimiento"][:10]
                days_diff = (datetime.fromisoformat(fecha_venc) - datetime.fromisoformat(today)).days
                
                if days_diff < 0:
                    total_vencidas += 1
                elif days_diff <= 10:
                    total_por_vencer += 1
        
        # Monthly grouping
        month_key = inv["created_at"][:7]
        if month_key not in monthly_data:
            monthly_data[month_key] = {"mes": month_key, "cantidad": 0, "monto": 0}
        monthly_data[month_key]["cantidad"] += 1
        monthly_data[month_key]["monto"] += inv["monto"]
    
    facturas_por_mes = sorted(monthly_data.values(), key=lambda x: x["mes"])[-12:]
    facturas_por_estatus = [{"estatus": k, "cantidad": v} for k, v in status_counts.items() if v > 0]
    
    return DashboardStats(
        total_pendientes=total_pendientes,
        total_por_vencer=total_por_vencer,
        total_vencidas=total_vencidas,
        total_pagadas=total_pagadas,
        monto_total_comprometido=monto_total,
        facturas_por_mes=facturas_por_mes,
        facturas_por_estatus=facturas_por_estatus
    )
