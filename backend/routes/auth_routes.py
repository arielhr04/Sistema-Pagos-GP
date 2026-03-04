from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from services.auth_service import verify_password, create_token, get_current_user
from db.session import get_db
from models.user import User
from models.area import Area

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Auth Routes
@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user: User | None = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.activo:
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    token = create_token(user.id, user.email, user.rol)

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
