from pydantic import BaseModel
from typing import Optional, List
from .enums import InvoiceStatusEnum

class InvoiceCreate(BaseModel):
    nombre_proveedor: str
    descripcion_factura: str
    area_procedencia: str
    monto: float
    fecha_vencimiento: str
    folio_fiscal: str

class InvoiceResponse(BaseModel):
    id: str
    nombre_proveedor: str
    descripcion_factura: str
    area_procedencia: str
    area_nombre: Optional[str] = None
    monto: float
    fecha_vencimiento: str
    folio_fiscal: str
    estatus: str
    fecha_pago_real: Optional[str] = None
    created_by: str
    created_by_nombre: Optional[str] = None
    created_at: str
    updated_at: str

class InvoiceStatusUpdate(BaseModel):
    nuevo_estatus: InvoiceStatusEnum
    fecha_pago_real: Optional[str] = None

class MovementHistoryResponse(BaseModel):
    id: str
    factura_id: str
    folio_fiscal: Optional[str] = None
    usuario_id: str
    usuario_nombre: Optional[str] = None
    estatus_anterior: str
    estatus_nuevo: str
    fecha_cambio: str

class DashboardStats(BaseModel):
    total_pendientes: int
    total_por_vencer: int
    total_vencidas: int
    total_pagadas: int
    monto_total_comprometido: float
    facturas_por_mes: List[dict]
    facturas_por_estatus: List[dict]
    