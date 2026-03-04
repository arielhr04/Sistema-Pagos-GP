import uuid
from sqlalchemy import Column, String
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Area(Base):
    __tablename__ = "tesoreriapp_gp_areas"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(String(1024))

    users = relationship("User", back_populates="area")
    invoices = relationship("Invoice", back_populates="area")
