import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class SupervisorEmpresa(Base):
    """Relación muchos-a-muchos: Un supervisor puede supervisar múltiples empresas"""
    __tablename__ = "tesoreriapp_gp_supervisor_empresa"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    supervisor_id = Column(String(36), ForeignKey("tesoreriapp_gp_users.id"), nullable=False)
    empresa_id = Column(String(36), ForeignKey("tesoreriapp_gp_empresas.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Restricción única: un supervisor no puede supervisar la misma empresa dos veces
    __table_args__ = (
        UniqueConstraint('supervisor_id', 'empresa_id', name='uq_supervisor_empresa'),
        Index('idx_supervisor_empresa_supervisor_id', 'supervisor_id'),
        Index('idx_supervisor_empresa_empresa_id', 'empresa_id'),
    )

    supervisor = relationship("User", back_populates="empresas_supervisadas")
    empresa = relationship("Area", back_populates="supervisores")
