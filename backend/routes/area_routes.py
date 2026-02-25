from fastapi import APIRouter, Depends, HTTPException
from typing import List
import uuid

from database import db
from schemas.area_schemas import AreaCreate, AreaResponse
from schemas.enums import RoleEnum
from services.auth_service import require_roles, get_current_user

router = APIRouter(prefix="/api/areas", tags=["Areas"])

@router.post("/", response_model=AreaResponse)
async def create_area(area_data: AreaCreate, current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    area_id = str(uuid.uuid4())
    area_doc = {
        "id": area_id,
        "nombre": area_data.nombre,
        "descripcion": area_data.descripcion
    }
    await db.areas.insert_one(area_doc)
    return AreaResponse(**area_doc)

@router.get("/", response_model=List[AreaResponse])
async def get_areas(current_user: dict = Depends(get_current_user)):
    areas = await db.areas.find({}, {"_id": 0}).to_list(100)
    return [AreaResponse(**a) for a in areas]

@router.delete("/{area_id}")
async def delete_area(area_id: str, current_user: dict = Depends(require_roles(RoleEnum.ADMINISTRADOR))):
    result = await db.areas.delete_one({"id": area_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Área no encontrada")
    return {"message": "Área eliminada"}