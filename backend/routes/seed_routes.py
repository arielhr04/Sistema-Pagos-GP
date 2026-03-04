from fastapi import APIRouter, Depends
from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from schemas.enums import RoleEnum
from services.auth_service import hash_password
from db.session import get_db
from models.area import Area
from models.user import User

router = APIRouter(prefix="/api", tags=["System"])

@router.post("/seed")
def seed_data(db: Session = Depends(get_db)):
    # Check if admin exists
    admin = db.query(User).filter(User.email == "admin@sistema.com").first()
    if admin:
        return {"message": "Data already seeded"}

    # Create areas
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

    # use naive UTC datetime objects so SQL Server datetime columns accept them
    now = datetime.utcnow()

    # Create users
    users = [
        User(
            id=str(uuid.uuid4()),
            email="admin@sistema.com",
            password=hash_password("admin123"),
            nombre="Administrador Principal",
            rol=RoleEnum.ADMINISTRADOR.value,
            area_id=None,
            activo=True,
            created_at=now,
            updated_at=now,
        ),
        User(
            id=str(uuid.uuid4()),
            email="tesorero@sistema.com",
            password=hash_password("tesorero123"),
            nombre="Tesorero Principal",
            rol=RoleEnum.TESORERO.value,
            area_id=areas[0].id,
            activo=True,
            created_at=now,
            updated_at=now,
        ),
        User(
            id=str(uuid.uuid4()),
            email="usuario@sistema.com",
            password=hash_password("usuario123"),
            nombre="Usuario de Área",
            rol=RoleEnum.USUARIO_AREA.value,
            area_id=areas[1].id,
            activo=True,
            created_at=now,
            updated_at=now,
        ),
    ]
    db.add_all(users)
    db.commit()

    return {"message": "Data seeded successfully", "users": [
        {"email": "admin@sistema.com", "password": "admin123", "rol": "Administrador"},
        {"email": "tesorero@sistema.com", "password": "tesorero123", "rol": "Tesorero"},
        {"email": "usuario@sistema.com", "password": "usuario123", "rol": "Usuario Área"},
    ]}
