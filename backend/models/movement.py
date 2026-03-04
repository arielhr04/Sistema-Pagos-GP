import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class MovementHistory(Base):
    __tablename__ = "tesoreriapp_gp_movement_history"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    factura_id = Column(String(36), ForeignKey("tesoreriapp_gp_invoices.id"), nullable=False)
    usuario_id = Column(String(36), ForeignKey("tesoreriapp_gp_users.id"), nullable=False)
    estatus_anterior = Column(String(50), nullable=False)
    estatus_nuevo = Column(String(50), nullable=False)
    fecha_cambio = Column(DateTime, nullable=False, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="movements")
    usuario = relationship("User", back_populates="movements")
