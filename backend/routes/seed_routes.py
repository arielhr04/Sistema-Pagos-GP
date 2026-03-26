from fastapi import APIRouter, Depends
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from backend.schemas.enums import RoleEnum
from backend.services.auth_service import hash_password, require_roles
from backend.db.session import get_db
from backend.models.area import Area
from backend.models.user import User

router = APIRouter(prefix="/api", tags=["System"])


@router.post("/seed")
def seed_data(
    current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)),
    db: Session = Depends(get_db),
):
    """Seed inicial de datos. Solo accesible para administradores."""
    admin = db.query(User).filter(User.email == "admin@sistema.com").first()
    if admin:
        return {"message": "Datos ya existentes — seed omitido"}

    areas = []
    for name, desc in [
        ("Finanzas", "Departamento de Finanzas"),
        ("Operaciones", "Departamento de Operaciones"),
        ("Recursos Humanos", "Departamento de RRHH"),
        ("Tecnología", "Departamento de TI"),
    ]:
        area_obj = Area(id=str(uuid.uuid4()), nombre=name, descripcion=desc)
        db.add(area_obj)
        areas.append(area_obj)
    db.commit()

    now = datetime.utcnow()

    users = [
        User(id=str(uuid.uuid4()), email="admin@sistema.com", password=hash_password("admin123"),
             nombre="Administrador Principal", rol=RoleEnum.ADMINISTRADOR.value,
             empresa_id=None, activo=True, tour_completed=False, created_at=now, updated_at=now),
        User(id=str(uuid.uuid4()), email="tesorero@sistema.com", password=hash_password("tesorero123"),
             nombre="Tesorero Principal", rol=RoleEnum.TESORERO.value,
             empresa_id=areas[0].id, activo=True, tour_completed=False, created_at=now, updated_at=now),
        User(id=str(uuid.uuid4()), email="usuario@sistema.com", password=hash_password("usuario123"),
             nombre="Usuario de Área", rol=RoleEnum.USUARIO_AREA.value,
             empresa_id=areas[1].id, activo=True, tour_completed=False, created_at=now, updated_at=now),
    ]
    db.add_all(users)
    db.commit()

    return {"message": "Seed completado", "usuarios_creados": len(users)}
