from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
import uuid
import logging

from sqlalchemy.orm import Session

from backend.schemas.area_schemas import AreaCreate, AreaResponse
from backend.schemas.enums import RoleEnum
from backend.services.auth_service import require_roles, get_current_user
from backend.db.session import get_db
from backend.models.area import Area
from backend.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/areas", tags=["Areas"])

@router.post("", response_model=AreaResponse)
def create_area(area_data: AreaCreate, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    area_id = str(uuid.uuid4())
    area_obj = Area(id=area_id, nombre=area_data.nombre, descripcion=area_data.descripcion)
    db.add(area_obj)
    db.commit()
    db.refresh(area_obj)
    return AreaResponse(id=area_obj.id, nombre=area_obj.nombre, descripcion=area_obj.descripcion)

@router.get("", response_model=dict)
def get_areas(
    page: int = Query(1, ge=1, description="Número de página"),
    limit: int = Query(20, ge=1, le=100, description="Registros por página"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener lista paginada de áreas. Accesible por todos los usuarios autenticados."""
    logger.info(f"📍 Obteniendo áreas para usuario: {current_user.email}")
    
    # Total para paginación
    total = db.query(Area).count()
    total_pages = max(1, (total + limit - 1) // limit)
    
    # Paginación
    offset = (page - 1) * limit
    areas = db.query(Area).order_by(Area.nombre).offset(offset).limit(limit).all()
    
    logger.info(f"✅ Áreas encontradas (página {page}): {len(areas)}")
    
    return {
        "items": [AreaResponse(id=a.id, nombre=a.nombre, descripcion=a.descripcion) for a in areas],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }

@router.delete("/{area_id}")
def delete_area(area_id: str, current_user: User = Depends(require_roles(RoleEnum.ADMINISTRADOR)), db: Session = Depends(get_db)):
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada")
    db.delete(area)
    db.commit()
    return {"message": "Área eliminada"}