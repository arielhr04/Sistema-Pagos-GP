import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from backend.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class LoginAudit(Base):
    __tablename__ = "tesoreriapp_gp_login_audit"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    usuario_id = Column(String(36), ForeignKey("tesoreriapp_gp_users.id"), nullable=True)
    email_intentado = Column(String(255), nullable=True)  # Para failed login attempts
    evento_tipo = Column(String(50), nullable=False)  # login_exitoso, login_fallido, logout, cambio_password
    razon = Column(String(255), nullable=True)  # contraseña incorrecta, email no existe, etc.
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    fecha = Column(DateTime, nullable=False, default=datetime.utcnow)
    estado = Column(String(20), nullable=False, default="success")  # success, failed

    usuario = relationship("User", back_populates="login_audits")
