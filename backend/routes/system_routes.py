from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["System"])

@router.get("/")
def root():
    return {"message": "Sistema de Gestión de Facturas API"}