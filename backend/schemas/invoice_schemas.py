from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from .enums import InvoiceStatusEnum
from backend.core.input_validation import sanitize_text, validate_iso_date, validate_uuid_value

class InvoiceCreate(BaseModel):
    nombre_proveedor: str = Field(..., max_length=255)
    descripcion_factura: str = Field(..., max_length=1024)
    area_procedencia: str
    monto: float
    fecha_vencimiento: str
    folio_fiscal: str = Field(..., max_length=255)

    @field_validator("nombre_proveedor")
    @classmethod
    def validate_nombre_proveedor(cls, value: str) -> str:
        return sanitize_text(value, "nombre_proveedor", max_length=255)

    @field_validator("descripcion_factura")
    @classmethod
    def validate_descripcion_factura(cls, value: str) -> str:
        return sanitize_text(value, "descripcion_factura", max_length=1024, allow_multiline=True)

    @field_validator("folio_fiscal")
    @classmethod
    def validate_folio_fiscal(cls, value: str) -> str:
        return sanitize_text(value, "folio_fiscal", max_length=255)

    @field_validator("area_procedencia")
    @classmethod
    def validate_area_procedencia(cls, value: str) -> str:
        validated = validate_uuid_value(value, "area_procedencia", required=True)
        return validated or value

    @field_validator("fecha_vencimiento")
    @classmethod
    def validate_fecha_vencimiento(cls, value: str) -> str:
        validated = validate_iso_date(value, "fecha_vencimiento", required=True)
        return validated or value

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
    comprobante_pago_subido: bool = False
    created_by: str
    created_by_nombre: Optional[str] = None
    revisada_por_tesoreria: bool = False
    fecha_revision_tesoreria: Optional[str] = None
    created_at: str
    updated_at: str

class InvoiceStatusUpdate(BaseModel):
    nuevo_estatus: InvoiceStatusEnum
    fecha_pago_real: Optional[str] = None

    @field_validator("fecha_pago_real")
    @classmethod
    def validate_fecha_pago_real(cls, value: Optional[str]) -> Optional[str]:
        return validate_iso_date(value, "fecha_pago_real", required=False)

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
    