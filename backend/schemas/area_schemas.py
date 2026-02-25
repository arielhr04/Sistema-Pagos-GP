from pydantic import BaseModel
from typing import Optional

class AreaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class AreaResponse(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str] = None
    