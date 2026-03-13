from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from .enums import RoleEnum
from backend.core.input_validation import sanitize_optional_text, sanitize_text, validate_uuid_value

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str = Field(..., max_length=255)
    rol: RoleEnum = RoleEnum.USUARIO_AREA
    area_id: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def validate_nombre(cls, value: str) -> str:
        return sanitize_text(value, "nombre", max_length=255)

    @field_validator("area_id")
    @classmethod
    def validate_area_id(cls, value: Optional[str]) -> Optional[str]:
        return validate_uuid_value(value, "area_id", required=False)

class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[RoleEnum] = None
    area_id: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("nombre")
    @classmethod
    def validate_nombre(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_optional_text(value, "nombre", max_length=255)

    @field_validator("area_id")
    @classmethod
    def validate_area_id(cls, value: Optional[str]) -> Optional[str]:
        return validate_uuid_value(value, "area_id", required=False)

class UserResponse(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    area_id: Optional[str] = None
    area_nombre: Optional[str] = None
    activo: bool
    created_at: str