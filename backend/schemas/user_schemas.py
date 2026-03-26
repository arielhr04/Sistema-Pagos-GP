from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
import re
from .enums import RoleEnum
from backend.core.input_validation import sanitize_optional_text, sanitize_text, validate_uuid_value


def _validate_password_policy(password: str) -> str:
    """Política de contraseñas: mín 8 caracteres, 1 mayúscula, 1 minúscula, 1 dígito."""
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    if not re.search(r"[A-Z]", password):
        raise ValueError("La contraseña debe incluir al menos una letra mayúscula")
    if not re.search(r"[a-z]", password):
        raise ValueError("La contraseña debe incluir al menos una letra minúscula")
    if not re.search(r"\d", password):
        raise ValueError("La contraseña debe incluir al menos un número")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str = Field(..., max_length=255)
    rol: RoleEnum = RoleEnum.USUARIO_AREA
    empresa_id: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password_policy(value)

    @field_validator("nombre")
    @classmethod
    def validate_nombre(cls, value: str) -> str:
        return sanitize_text(value, "nombre", max_length=255)

    @field_validator("empresa_id")
    @classmethod
    def validate_empresa_id(cls, value: Optional[str]) -> Optional[str]:
        return validate_uuid_value(value, "empresa_id", required=False)

class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[RoleEnum] = None
    empresa_id: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("nombre")
    @classmethod
    def validate_nombre(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_optional_text(value, "nombre", max_length=255)

    @field_validator("empresa_id")
    @classmethod
    def validate_empresa_id(cls, value: Optional[str]) -> Optional[str]:
        return validate_uuid_value(value, "empresa_id", required=False)

class UserResponse(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    empresa_id: Optional[str] = None
    empresa_nombre: Optional[str] = None
    activo: bool
    tour_completed: bool = False
    created_at: str


class ChangePassword(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return _validate_password_policy(value)