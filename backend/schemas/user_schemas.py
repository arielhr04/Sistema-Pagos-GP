from pydantic import BaseModel, EmailStr
from typing import Optional
from .enums import RoleEnum

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    rol: RoleEnum = RoleEnum.USUARIO_AREA
    area_id: Optional[str] = None

class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[RoleEnum] = None
    area_id: Optional[str] = None
    activo: Optional[bool] = None

class UserResponse(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    area_id: Optional[str] = None
    area_nombre: Optional[str] = None
    activo: bool
    created_at: str