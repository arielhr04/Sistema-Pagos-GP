from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["System"])

@router.get("/")
async def root():
    return {"message": "Sistema de Gestión de Facturas API"}