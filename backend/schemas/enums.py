from enum import Enum

class RoleEnum(str, Enum):
    ADMINISTRADOR = "Administrador"
    TESORERO = "Tesorero"
    USUARIO_AREA = "Usuario Área"

class InvoiceStatusEnum(str, Enum):
    CAPTURADA = "Capturada"
    EN_REVISION = "En revisión"
    PROGRAMADA = "Programada"
    PAGADA = "Pagada"
    RECHAZADA = "Rechazada"