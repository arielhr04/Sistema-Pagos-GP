from datetime import datetime
import re
from typing import Optional
from uuid import UUID


_CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_MULTISPACE_PATTERN = re.compile(r"\s+")
_ENCODED_SCRIPT_PATTERN = re.compile(r"(?i)(&lt;|&#x0*3c;|&#0*60;|javascript:|vbscript:|data\s*:\s*text/html|on\w+\s*=)")


def _normalize_text(value: str, allow_multiline: bool = False) -> str:
    normalized = _CONTROL_CHARS_PATTERN.sub("", str(value))
    normalized = normalized.strip()

    if allow_multiline:
        normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    else:
        normalized = _MULTISPACE_PATTERN.sub(" ", normalized)

    return normalized


def sanitize_text(
    value: Optional[str],
    field_name: str,
    *,
    max_length: Optional[int] = None,
    allow_multiline: bool = False,
    required: bool = True,
) -> Optional[str]:
    if value is None:
        if required:
            raise ValueError(f"El campo '{field_name}' es obligatorio")
        return None

    normalized = _normalize_text(value, allow_multiline=allow_multiline)

    if not normalized:
        if required:
            raise ValueError(f"El campo '{field_name}' no puede estar vacío")
        return None

    if max_length and len(normalized) > max_length:
        raise ValueError(f"El campo '{field_name}' excede {max_length} caracteres")

    if "<" in normalized or ">" in normalized or _ENCODED_SCRIPT_PATTERN.search(normalized):
        raise ValueError(f"El campo '{field_name}' contiene contenido no permitido")

    return normalized


def sanitize_optional_text(
    value: Optional[str],
    field_name: str,
    *,
    max_length: Optional[int] = None,
    allow_multiline: bool = False,
) -> Optional[str]:
    return sanitize_text(
        value,
        field_name,
        max_length=max_length,
        allow_multiline=allow_multiline,
        required=False,
    )


def validate_uuid_value(value: Optional[str], field_name: str, *, required: bool = False) -> Optional[str]:
    if value is None:
        if required:
            raise ValueError(f"El campo '{field_name}' es obligatorio")
        return None

    normalized = str(value).strip()
    if not normalized:
        if required:
            raise ValueError(f"El campo '{field_name}' es obligatorio")
        return None

    try:
        UUID(normalized)
    except ValueError as exc:
        raise ValueError(f"El campo '{field_name}' no es un UUID válido") from exc

    return normalized


def validate_iso_date(value: Optional[str], field_name: str, *, required: bool = False) -> Optional[str]:
    if value is None:
        if required:
            raise ValueError(f"El campo '{field_name}' es obligatorio")
        return None

    normalized = str(value).strip()
    if not normalized:
        if required:
            raise ValueError(f"El campo '{field_name}' es obligatorio")
        return None

    try:
        datetime.strptime(normalized, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"El campo '{field_name}' debe tener formato YYYY-MM-DD") from exc

    return normalized