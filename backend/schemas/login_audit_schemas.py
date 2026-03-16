from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class LoginAuditResponse(BaseModel):
    id: str
    usuario_id: Optional[str] = None
    email_intentado: Optional[str] = None
    usuario_nombre: Optional[str] = None
    evento_tipo: str
    razon: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    fecha: datetime
    estado: str

    class Config:
        from_attributes = True
