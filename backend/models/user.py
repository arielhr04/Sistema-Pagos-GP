import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    # standardised table name with prefix
    __tablename__ = "tesoreriapp_gp_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    nombre = Column(String(255), nullable=False)
    rol = Column(String(50), nullable=False)
    area_id = Column(String(36), ForeignKey("tesoreriapp_gp_areas.id"), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    area = relationship("Area", back_populates="users")
    invoices = relationship("Invoice", back_populates="creator")
    movements = relationship("MovementHistory", back_populates="usuario")
