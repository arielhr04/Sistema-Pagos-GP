from pydantic import BaseModel, Field, field_validator
from typing import Optional
from backend.core.input_validation import sanitize_optional_text, sanitize_text

class AreaCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=1024)

    @field_validator("nombre")
    @classmethod
    def validate_nombre(cls, value: str) -> str:
        return sanitize_text(value, "nombre", max_length=255)

    @field_validator("descripcion")
    @classmethod
    def validate_descripcion(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_optional_text(value, "descripcion", max_length=1024, allow_multiline=True)

class AreaResponse(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str] = None
    