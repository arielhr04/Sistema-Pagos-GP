from fastapi import APIRouter, HTTPException, Depends
from database import db
import bcrypt
import jwt
import os
from schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from services.auth_service import verify_password, create_token, get_current_user, require_roles

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Auth Routes
@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user or not verify_password(request.password, user["password"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.get("activo", True):
        raise HTTPException(status_code=401, detail="Usuario desactivado")
    
    token = create_token(user["id"], user["email"], user["rol"])
    
    area_nombre = None
    if user.get("area_id"):
        area = await db.areas.find_one({"id": user["area_id"]}, {"_id": 0})
        area_nombre = area["nombre"] if area else None
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            nombre=user["nombre"],
            rol=user["rol"],
            area_id=user.get("area_id"),
            area_nombre=area_nombre,
            activo=user.get("activo", True),
            created_at=user["created_at"]
        )
    )

@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    area_nombre = None
    if user.get("area_id"):
        area = await db.areas.find_one({"id": user["area_id"]}, {"_id": 0})
        area_nombre = area["nombre"] if area else None
    
    return UserResponse(
        id=user["id"],
        email=user["email"],
        nombre=user["nombre"],
        rol=user["rol"],
        area_id=user.get("area_id"),
        area_nombre=area_nombre,
        activo=user.get("activo", True),
        created_at=user["created_at"]
    )