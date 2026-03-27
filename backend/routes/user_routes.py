from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import List
from datetime import datetime
import uuid
from io import BytesIO
import logging
from openpyxl import Workbook

from sqlalchemy.orm import Session

from backend.schemas.user_schemas import UserCreate, UserUpdate, UserResponse, ChangePassword
from backend.schemas.enums import RoleEnum
from backend.services.auth_service import require_roles, hash_password
from backend.db.session import get_db
from backend.models.user import User
from backend.models.area import Area
from backend.models.supervisor_empresa import SupervisorEmpresa

router = APIRouter(prefix="/api/users", tags=["Users"])
logger = logging.getLogger(__name__)


def _to_iso_datetime(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)

# Users Routes
@router.post("", response_model=UserResponse)
@router.post("/", response_model=UserResponse, include_in_schema=False)
def create_user(user_data: UserCreate, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    logger.info(f"🔵 [USER CREATE] Datos recibidos: email={user_data.email}, nombre={user_data.nombre}, rol={user_data.rol}, empresa_id={user_data.empresa_id}")
    
    try:
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            logger.warning(f"⚠️ [USER CREATE] Email ya registrado: {user_data.email}")
            raise HTTPException(status_code=400, detail="El email ya está registrado")

        user_id = str(uuid.uuid4())
        # use naive UTC datetimes for database compatibility
        now = datetime.utcnow()

        # convert blank empresa IDs to None so FK constraints are not violated
        empresa_id = user_data.empresa_id if user_data.empresa_id else None
        
        logger.info(f"🔵 [USER CREATE] Creando usuario: {user_data.email}, rol type: {type(user_data.rol)}, rol value: {user_data.rol.value if hasattr(user_data.rol, 'value') else user_data.rol}")
        
        user_obj = User(
            id=user_id,
            email=user_data.email,
            password=hash_password(user_data.password),
            nombre=user_data.nombre,
            rol=user_data.rol.value if hasattr(user_data.rol, 'value') else user_data.rol,
            empresa_id=empresa_id,
            activo=True,
            created_at=now,
            updated_at=now,
        )
        db.add(user_obj)
        db.commit()
        db.refresh(user_obj)
        logger.info(f"✅ [USER CREATE] Usuario creado exitosamente: {user_obj.id}")

        empresa_nombre = None
        if user_data.empresa_id:
            empresa_obj = db.query(Area).filter(Area.id == user_data.empresa_id).first()
            empresa_nombre = empresa_obj.nombre if empresa_obj else None

        return UserResponse(
            id=user_obj.id,
            email=user_obj.email,
            nombre=user_obj.nombre,
            rol=user_obj.rol,
            empresa_id=user_obj.empresa_id,
            empresa_nombre=empresa_nombre,
            activo=user_obj.activo,
            tour_completed=user_obj.tour_completed or False,
            created_at=_to_iso_datetime(user_obj.created_at),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [USER CREATE] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al crear usuario: {str(e)}")

@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse], include_in_schema=False)
def get_users(current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    users = db.query(User).all()
    empresas = {a.id: a.nombre for a in db.query(Area).all()}
    response_items: List[UserResponse] = []

    for u in users:
        try:
            response_items.append(
                UserResponse(
                    id=u.id,
                    email=u.email,
                    nombre=u.nombre,
                    rol=u.rol,
                    empresa_id=u.empresa_id,
                    empresa_nombre=empresas.get(u.empresa_id),
                    activo=u.activo,
                    tour_completed=u.tour_completed or False,
                    created_at=_to_iso_datetime(u.created_at),
                )
            )
        except Exception:
            logger.exception("Error serializando usuario %s", u.id)

    return response_items

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_data: UserUpdate, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    logger.info(f"🔵 [USER UPDATE] user_id={user_id}, datos recibidos: {user_data}")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.error(f"❌ [USER UPDATE] Usuario no encontrado: {user_id}")
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user_data.nombre is not None:
        logger.info(f"🔵 [USER UPDATE] Actualizando nombre: {user.nombre} -> {user_data.nombre}")
        user.nombre = user_data.nombre
    if user_data.rol is not None:
        logger.info(f"🔵 [USER UPDATE] Actualizando rol: {user.rol} -> {user_data.rol.value}")
        user.rol = user_data.rol.value
    
    # Actualizar empresa_id (puede ser None para "Sin empresa", string vacío, o UUID válido)
    if hasattr(user_data, 'empresa_id'):
        new_empresa_id = user_data.empresa_id if user_data.empresa_id else None
        logger.info(f"🔵 [USER UPDATE] Actualizando empresa_id: {user.empresa_id} -> {new_empresa_id}")
        user.empresa_id = new_empresa_id
    
    if user_data.activo is not None:
        logger.info(f"🔵 [USER UPDATE] Actualizando activo: {user.activo} -> {user_data.activo}")
        user.activo = user_data.activo
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    logger.info(f"✅ [USER UPDATE] Usuario actualizado exitosamente: {user_id}")

    empresa_nombre = None
    if user.empresa_id:
        empresa_obj = db.query(Area).filter(Area.id == user.empresa_id).first()
        empresa_nombre = empresa_obj.nombre if empresa_obj else None

    return UserResponse(
        id=user.id,
        email=user.email,
        nombre=user.nombre,
        rol=user.rol,
        empresa_id=user.empresa_id,
        empresa_nombre=empresa_nombre,
        activo=user.activo,
        tour_completed=user.tour_completed or False,
        created_at=_to_iso_datetime(user.created_at),
    )

@router.delete("/{user_id}")
def delete_user(user_id: str, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"message": "Usuario eliminado"}


@router.put("/{user_id}/password")
def change_user_password(
    user_id: str,
    payload: ChangePassword,
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    """Cambiar contraseña de un usuario (solo administradores)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.password = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    db.commit()
    logger.info("Contraseña actualizada para usuario %s por admin %s", user_id, current_user.id)
    return {"message": "Contraseña actualizada exitosamente"}


@router.get("/{user_id}/empresas-supervisadas")
def get_supervisor_empresas(
    user_id: str,
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    """Obtener la lista de empresas que supervisa un usuario."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.rol != RoleEnum.SUPERVISOR.value:
        raise HTTPException(status_code=400, detail="Este usuario no es un supervisor")

    supervisadas = db.query(SupervisorEmpresa).filter(SupervisorEmpresa.supervisor_id == user_id).all()
    empresa_ids = [s.empresa_id for s in supervisadas]
    
    logger.info(f"🔵 [SUPERVISOR] {user.email} supervisa {len(empresa_ids)} empresas: {empresa_ids}")
    return {"empresa_ids": empresa_ids}


@router.post("/{user_id}/empresas-supervisadas")
def assign_supervisor_empresas(
    user_id: str,
    payload: dict,
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    """Asignar múltiples empresas a un supervisor."""
    logger.info(f"🔵 [SUPERVISOR ASSIGN] Usuario {user_id}, payload: {payload}")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.rol != RoleEnum.SUPERVISOR.value:
        raise HTTPException(status_code=400, detail="Este usuario no es un supervisor")

    empresa_ids = payload.get("empresa_ids", [])
    if not isinstance(empresa_ids, list):
        raise HTTPException(status_code=400, detail="empresa_ids debe ser una lista")

    try:
        # Eliminar todas las asignaciones anteriores
        db.query(SupervisorEmpresa).filter(SupervisorEmpresa.supervisor_id == user_id).delete()
        logger.info(f"✅ [SUPERVISOR ASSIGN] Eliminadas asignaciones anteriores para {user.email}")

        # Crear nuevas asignaciones
        now = datetime.utcnow()
        for empresa_id in empresa_ids:
            # Verificar que la empresa existe
            empresa = db.query(Area).filter(Area.id == empresa_id).first()
            if not empresa:
                logger.warning(f"⚠️ [SUPERVISOR ASSIGN] Empresa no encontrada: {empresa_id}")
                continue

            supervisor_rel = SupervisorEmpresa(
                id=str(uuid.uuid4()),
                supervisor_id=user_id,
                empresa_id=empresa_id,
                created_at=now
            )
            db.add(supervisor_rel)
            logger.info(f"✅ [SUPERVISOR ASSIGN] Asignado {user.email} → {empresa.nombre}")

        db.commit()
        logger.info(f"✅ [SUPERVISOR ASSIGN] Completado: {len(empresa_ids)} empresas asignadas a {user.email}")
        
        return {
            "message": f"Se asignaron {len(empresa_ids)} empresas al supervisor",
            "supervisor_id": user_id,
            "empresa_ids": empresa_ids
        }
    except Exception as e:
        logger.error(f"❌ [SUPERVISOR ASSIGN] Error: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al asignar empresas: {str(e)}")


@router.get("/export/excel")
def export_users_excel(current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    # generate simple spreadsheet containing all users
    users = db.query(User).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Usuarios"
    ws.append(["ID", "Email", "Nombre", "Rol", "Empresa ID", "Activo", "Created At"])
    for u in users:
        ws.append([
            u.id,
            u.email,
            u.nombre,
            u.rol,
            u.empresa_id,
            u.activo,
            u.created_at.isoformat() if u.created_at else None,
        ])
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=usuarios.xlsx"},
    )
