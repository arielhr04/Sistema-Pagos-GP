from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
import uuid
from database import db
from schemas.user_schemas import UserCreate, UserUpdate, UserResponse
from schemas.enums import RoleEnum
from services.auth_service import require_roles
from services.auth_service import hash_password  # temporal si aún está en server

router = APIRouter(prefix="/api/users", tags=["Users"])

# Users Routes
@router.post("/", response_model=UserResponse)
async def create_user(user_data: UserCreate, current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "nombre": user_data.nombre,
        "rol": user_data.rol.value,
        "area_id": user_data.area_id,
        "activo": True,
        "created_at": now,
        "updated_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    area_nombre = None
    if user_data.area_id:
        area = await db.areas.find_one({"id": user_data.area_id}, {"_id": 0})
        area_nombre = area["nombre"] if area else None
    
    return UserResponse(
        id=user_id,
        email=user_data.email,
        nombre=user_data.nombre,
        rol=user_data.rol.value,
        area_id=user_data.area_id,
        area_nombre=area_nombre,
        activo=True,
        created_at=now
    )

@router.get("/", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    
    areas = {a["id"]: a["nombre"] for a in await db.areas.find({}, {"_id": 0, "id": 1, "nombre": 1}).to_list(50)}
    
    return [
        UserResponse(
            id=u["id"],
            email=u["email"],
            nombre=u["nombre"],
            rol=u["rol"],
            area_id=u.get("area_id"),
            area_nombre=areas.get(u.get("area_id")),
            activo=u.get("activo", True),
            created_at=u["created_at"]
        ) for u in users
    ]

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    update_dict = {k: v for k, v in user_data.model_dump().items() if v is not None}
    if "rol" in update_dict:
        update_dict["rol"] = update_dict["rol"].value
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({"id": user_id}, {"$set": update_dict})
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    
    area_nombre = None
    if updated_user.get("area_id"):
        area = await db.areas.find_one({"id": updated_user["area_id"]}, {"_id": 0})
        area_nombre = area["nombre"] if area else None
    
    return UserResponse(
        id=updated_user["id"],
        email=updated_user["email"],
        nombre=updated_user["nombre"],
        rol=updated_user["rol"],
        area_id=updated_user.get("area_id"),
        area_nombre=area_nombre,
        activo=updated_user.get("activo", True),
        created_at=updated_user["created_at"]
    )

@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    return {"message": "Usuario eliminado"}