from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from backend.schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from backend.services.auth_service import verify_password, create_token, get_current_user
from backend.db.session import get_db
from backend.models.user import User
from backend.models.area import Area

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Auth Routes
@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    logger.info(f"🔐 Intento de login con email: {request.email}")
    
    user: User | None = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        logger.warning(f"❌ Usuario no encontrado: {request.email}")
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    logger.info(f"✓ Usuario encontrado: {user.email} (activo: {user.activo})")
    
    # Verificar contraseña
    is_password_valid = verify_password(request.password, user.password)
    logger.info(f"🔑 Verificación contraseña: {is_password_valid}")
    
    if not is_password_valid:
        logger.warning(f"❌ Contraseña incorrecta para: {request.email}")
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    if not user.activo:
        logger.warning(f"❌ Usuario desactivado: {request.email}")
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    token = create_token(user.id, user.email, user.rol)
    logger.info(f"✅ Login exitoso para: {request.email}")

    area_nombre = None
    if user.area_id:
        area_obj = db.query(Area).filter(Area.id == user.area_id).first()
        area_nombre = area_obj.nombre if area_obj else None

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            nombre=user.nombre,
            rol=user.rol,
            area_id=user.area_id,
            area_nombre=area_nombre,
            activo=user.activo,
            created_at=user.created_at.isoformat(),
        ),
    )

@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
        created_at=user.created_at.isoformat(),
    )
@router.post("/debug/login-test")
def debug_login_test(email: str, password: str, db: Session = Depends(get_db)):
    """Endpoint de debug para verificar login sin necesidad de JSON."""
    import os
    if os.environ.get("ENV") == "production":
        return {"error": "No disponible en producción"}
    
    logger.info(f"🔍 DEBUG LOGIN TEST: email={email}, password_length={len(password)}")
    
    # Buscar usuario
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        return {
            "status": "error",
            "message": f"Usuario {email} no encontrado",
            "usuarios_disponibles": [u.email for u in db.query(User).all()]
        }
    
    # Verificar contraseña
    is_valid = verify_password(password, user.password)
    
    return {
        "status": "success" if is_valid else "invalid_password",
        "email": email,
        "usuario_encontrado": True,
        "usuario_activo": user.activo,
        "contraseña_correcta": is_valid,
        "usuario_nombre": user.nombre,
        "usuario_rol": user.rol,
        "hash_password_en_bd": user.password[:40] + "...",
        "mensaje": "✅ Puedes acceder" if (is_valid and user.activo) else "❌ No puedes acceder",
        "razon_fallo": "Contraseña incorrecta" if not is_valid else ("Usuario desactivado" if not user.activo else None)
    }