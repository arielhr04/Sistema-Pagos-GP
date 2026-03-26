import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, LargeBinary, Index, Boolean
from sqlalchemy.orm import deferred, relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Invoice(Base):
    __tablename__ = "tesoreriapp_gp_invoices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    nombre_proveedor = Column(String(255), nullable=False)
    descripcion_factura = Column(String(1024), nullable=False)
    empresa_factura = Column(String(36), ForeignKey("tesoreriapp_gp_empresas.id"), nullable=False)
    monto = Column(Float, nullable=False)
    fecha_vencimiento = Column(String(50), nullable=False)
    folio_fiscal = Column(String(255), unique=True, nullable=False)
    estatus = Column(String(50), nullable=False)
    pdf_data = deferred(Column(LargeBinary, nullable=True))
    comprobante_pago_data = deferred(Column(LargeBinary, nullable=True))
    fecha_pago_real = Column(String(50))
    created_by = Column(String(36), ForeignKey("tesoreriapp_gp_users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Campos para supervisor
    requiere_autorizacion = Column(Boolean, default=False, nullable=False)
    aprobada_por_supervisor = Column(Boolean, default=False, nullable=False)
    supervisor_id = Column(String(36), ForeignKey("tesoreriapp_gp_users.id"), nullable=True)
    fecha_aprobacion_supervisor = Column(DateTime, nullable=True)

    # Índices para búsquedas y filtros frecuentes
    __table_args__ = (
        Index('idx_invoice_estatus', 'estatus'),
        Index('idx_invoice_fecha_vencimiento', 'fecha_vencimiento'),
        Index('idx_invoice_folio_fiscal', 'folio_fiscal'),
        Index('idx_invoice_nombre_proveedor', 'nombre_proveedor'),
        Index('idx_invoice_created_by', 'created_by'),
        Index('idx_invoice_empresa_factura', 'empresa_factura'),
        Index('idx_invoice_requiere_autorizacion', 'requiere_autorizacion'),
        Index('idx_invoice_supervisor_id', 'supervisor_id'),
    )

    creator = relationship("User", back_populates="invoices")
    empresa = relationship("Area", back_populates="invoices")
    supervisor = relationship("User", foreign_keys=[supervisor_id])
    movements = relationship("MovementHistory", back_populates="invoice")
    documents = relationship("InvoiceDocument", back_populates="invoice", cascade="all, delete-orphan")
