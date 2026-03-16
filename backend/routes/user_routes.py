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
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    user_id = str(uuid.uuid4())
    # use naive UTC datetimes for database compatibility
    now = datetime.utcnow()

    # convert blank area IDs to None so FK constraints are not violated
    area_id = user_data.area_id if user_data.area_id else None
    user_obj = User(
        id=user_id,
        email=user_data.email,
        password=hash_password(user_data.password),
        nombre=user_data.nombre,
        rol=user_data.rol.value,
        area_id=area_id,
        activo=True,
        created_at=now,
        updated_at=now,
    )
    db.add(user_obj)
    db.commit()
    db.refresh(user_obj)

    area_nombre = None
    if user_data.area_id:
        area_obj = db.query(Area).filter(Area.id == user_data.area_id).first()
        area_nombre = area_obj.nombre if area_obj else None

    return UserResponse(
        id=user_obj.id,
        email=user_obj.email,
        nombre=user_obj.nombre,
        rol=user_obj.rol,
        area_id=user_obj.area_id,
        area_nombre=area_nombre,
        activo=user_obj.activo,
        created_at=_to_iso_datetime(user_obj.created_at),
    )

@router.get("", response_model=dict)
@router.get("/", response_model=dict, include_in_schema=False)
def get_users(
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(20, ge=1, le=100, description="Registros por página"),
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db)
):
    """Obtener lista paginada de usuarios."""
    # Total para paginación
    total = db.query(User).count()
    total_pages = max(1, (total + limit - 1) // limit)
    
    # Paginación
    offset = (page - 1) * limit
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    
    areas = {a.id: a.nombre for a in db.query(Area).all()}
    response_items: List[UserResponse] = []

    for u in users:
        try:
            response_items.append(
                UserResponse(
                    id=u.id,
                    email=u.email,
                    nombre=u.nombre,
                    rol=u.rol,
                    area_id=u.area_id,
                    area_nombre=areas.get(u.area_id),
                    activo=u.activo,
                    created_at=_to_iso_datetime(u.created_at),
                )
            )
        except Exception:
            logger.exception("Error serializando usuario %s", u.id)

    return {
        "items": response_items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_data: UserUpdate, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user_data.nombre is not None:
        user.nombre = user_data.nombre
    if user_data.rol is not None:
        user.rol = user_data.rol.value
    if user_data.area_id is not None:
        user.area_id = user_data.area_id if user_data.area_id else None
    if user_data.activo is not None:
        user.activo = user_data.activo
    user.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)

    area_nombre = None
    if user.area_id:
        area_obj = db.query(Area).filter(Area.id == user.area_id).first()
        area_nombre = area_obj.nombre if area_obj else None

    return UserResponse(
        id=user.id,
        email=user.email,
        nombre=user.nombre,
        rol=user.rol,
        area_id=user.area_id,
        area_nombre=area_nombre,
        activo=user.activo,
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


@router.get("/export/excel")
def export_users_excel(current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    # generate simple spreadsheet containing all users
    users = db.query(User).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Usuarios"
    ws.append(["ID", "Email", "Nombre", "Rol", "Area ID", "Activo", "Created At"])
    for u in users:
        ws.append([
            u.id,
            u.email,
            u.nombre,
            u.rol,
            u.area_id,
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
