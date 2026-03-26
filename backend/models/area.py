import uuid
from sqlalchemy import Column, String, Index
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Area(Base):
    """Representa una Empresa/Unidad de negocio"""
    __tablename__ = "tesoreriapp_gp_empresas"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(String(1024))

    # Índices para búsquedas
    __table_args__ = (
        Index('idx_empresa_nombre', 'nombre'),
    )

    usuarios = relationship("User", back_populates="empresa")
    invoices = relationship("Invoice", back_populates="empresa")
    supervisores = relationship("SupervisorEmpresa", back_populates="empresa")
