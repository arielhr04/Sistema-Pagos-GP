from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
import logging
from datetime import datetime

from backend.schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse, RefreshRequest
from backend.services.auth_service import verify_password, create_token, create_refresh_token, verify_refresh_token, get_current_user
from backend.core.rate_limiter import check_rate_limit, reset_rate_limit
from backend.db.session import get_db
from backend.models.user import User
from backend.models.area import Area
from backend.models.login_audit import LoginAudit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, raw_request: Request, db: Session = Depends(get_db)):
    """Autenticar usuario y generar JWT."""
    # Capturar IP y User-Agent
    client_ip = raw_request.client.host if raw_request.client else "unknown"
    user_agent = raw_request.headers.get("user-agent", "unknown")
    
    # Rate limiting por IP
    wait_seconds = check_rate_limit(client_ip)
    if wait_seconds is not None:
        minutes = (wait_seconds // 60) + 1
        logger.warning("Rate limit alcanzado para IP %s", client_ip)
        raise HTTPException(
            status_code=429,
            detail=f"Demasiados intentos. Intente de nuevo en {minutes} minutos.",
        )

    user: User | None = db.query(User).filter(User.email == request.email).first()

    if not user:
        logger.warning("Login fallido — email no encontrado: %s", request.email)
        # Registrar intento fallido en audit
        audit_log = LoginAudit(
            email_intentado=request.email,
            evento_tipo="login_fallido",
            razon="email_no_encontrado",
            ip_address=client_ip,
            user_agent=user_agent,
            estado="failed",
            fecha=datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not verify_password(request.password, user.password):
        logger.warning("Login fallido — contraseña incorrecta: %s", request.email)
        # Registrar intento fallido en audit
        audit_log = LoginAudit(
            usuario_id=user.id,
            email_intentado=request.email,
            evento_tipo="login_fallido",
            razon="contraseña_incorrecta",
            ip_address=client_ip,
            user_agent=user_agent,
            estado="failed",
            fecha=datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not user.activo:
        logger.warning("Login fallido — usuario desactivado: %s", request.email)
        # Registrar intento fallido en audit
        audit_log = LoginAudit(
            usuario_id=user.id,
            email_intentado=request.email,
            evento_tipo="login_fallido",
            razon="usuario_desactivado",
            ip_address=client_ip,
            user_agent=user_agent,
            estado="failed",
            fecha=datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    # Login exitoso — reiniciar contador de intentos
    reset_rate_limit(client_ip)

    # Registrar login exitoso en audit
    audit_log = LoginAudit(
        usuario_id=user.id,
        email_intentado=request.email,
        evento_tipo="login_exitoso",
        ip_address=client_ip,
        user_agent=user_agent,
        estado="success",
        fecha=datetime.utcnow()
    )
    db.add(audit_log)
    db.commit()

    token = create_token(user.id, user.email, user.rol)
    refresh = create_refresh_token(user.id)
    logger.info("Login exitoso: %s (%s)", request.email, user.rol)

    area_nombre = None
    if user.area_id:
        area_obj = db.query(Area).filter(Area.id == user.area_id).first()
        area_nombre = area_obj.nombre if area_obj else None

    return TokenResponse(
        access_token=token,
        refresh_token=refresh,
        user=UserResponse(
            id=user.id,
            email=user.email,
            nombre=user.nombre,
            rol=user.rol,
            area_id=user.area_id,
            area_nombre=area_nombre,
            activo=user.activo,
            tour_completed=user.tour_completed or False,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Obtener datos del usuario autenticado."""
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
        tour_completed=user.tour_completed or False,
        created_at=user.created_at.isoformat(),
    )


@router.post("/tour-completed")
def mark_tour_completed(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Marcar el tour de onboarding como completado."""
    current_user.tour_completed = True
    db.commit()
    return {"ok": True}


@router.post("/refresh")
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Obtener nuevos tokens usando un refresh token válido."""
    user_id = verify_refresh_token(payload.refresh_token)

    user: User | None = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if not user.activo:
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    new_access = create_token(user.id, user.email, user.rol)
    new_refresh = create_refresh_token(user.id)

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
    }