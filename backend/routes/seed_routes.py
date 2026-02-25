from fastapi import APIRouter
from datetime import datetime, timezone
import uuid

from database import db
from schemas.enums import RoleEnum
from services.auth_service import hash_password

router = APIRouter(prefix="/api", tags=["System"])

@router.post("/seed")
async def seed_data():
    # Check if admin exists
    admin = await db.users.find_one({"email": "admin@sistema.com"})
    if admin:
        return {"message": "Data already seeded"}
    
    # Create areas
    areas_data = [
        {"id": str(uuid.uuid4()), "nombre": "Finanzas", "descripcion": "Departamento de Finanzas"},
        {"id": str(uuid.uuid4()), "nombre": "Operaciones", "descripcion": "Departamento de Operaciones"},
        {"id": str(uuid.uuid4()), "nombre": "Recursos Humanos", "descripcion": "Departamento de RRHH"},
        {"id": str(uuid.uuid4()), "nombre": "Tecnología", "descripcion": "Departamento de TI"},
    ]
    await db.areas.insert_many(areas_data)
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Create users
    users_data = [
        {
            "id": str(uuid.uuid4()),
            "email": "admin@sistema.com",
            "password": hash_password("admin123"),
            "nombre": "Administrador Principal",
            "rol": RoleEnum.ADMINISTRADOR.value,
            "area_id": None,
            "activo": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "email": "tesorero@sistema.com",
            "password": hash_password("tesorero123"),
            "nombre": "Tesorero Principal",
            "rol": RoleEnum.TESORERO.value,
            "area_id": areas_data[0]["id"],
            "activo": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "email": "usuario@sistema.com",
            "password": hash_password("usuario123"),
            "nombre": "Usuario de Área",
            "rol": RoleEnum.USUARIO_AREA.value,
            "area_id": areas_data[1]["id"],
            "activo": True,
            "created_at": now,
            "updated_at": now
        }
    ]
    await db.users.insert_many(users_data)
    
    return {"message": "Data seeded successfully", "users": [
        {"email": "admin@sistema.com", "password": "admin123", "rol": "Administrador"},
        {"email": "tesorero@sistema.com", "password": "tesorero123", "rol": "Tesorero"},
        {"email": "usuario@sistema.com", "password": "usuario123", "rol": "Usuario Área"}
    ]}

