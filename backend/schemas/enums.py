from enum import Enum

class RoleEnum(str, Enum):
    ADMINISTRADOR = "Administrador"
    TESORERO = "Tesorero"
    USUARIO_AREA = "Usuario Área"
    SUPERVISOR = "Supervisor"

class InvoiceStatusEnum(str, Enum):
    PENDIENTE_AUTORIZACION = "Pendiente de Autorización"
    CAPTURADA = "Capturada"
    EN_REVISION = "En revisión"
    PROGRAMADA = "Programada"
    PAGADA = "Pagada"
    RECHAZADA = "Rechazada"
    RECHAZADA_SUPERVISOR = "Rechazada por Supervisor"