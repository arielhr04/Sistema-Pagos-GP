from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import bcrypt
import jwt
from sqlalchemy.orm import Session

from backend.core.config import JWT_SECRET, REFRESH_SECRET
from backend.db.session import get_db
from backend.models.user import User

# JWT Settings (secretos centralizados en config.py)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 7

security = HTTPBearer()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, rol: str) -> str:
    """Access token — corta vida (15 min)."""
    payload = {
        "sub": user_id,
        "email": email,
        "rol": rol,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    """Refresh token — larga vida (7 días), solo contiene user_id."""
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, REFRESH_SECRET, algorithm=JWT_ALGORITHM)

def verify_refresh_token(token_str: str) -> str:
    """Verificar refresh token. Retorna user_id o lanza excepción."""
    try:
        payload = jwt.decode(token_str, REFRESH_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expirado. Inicie sesión nuevamente.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Refresh token inválido")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user: User | None = db.query(User).filter(User.id == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        if not user.activo:
            raise HTTPException(status_code=401, detail="Usuario desactivado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def require_roles(*roles):
    def role_checker(user: User = Depends(get_current_user)):
        if user.rol not in roles:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        return user
    return role_checker