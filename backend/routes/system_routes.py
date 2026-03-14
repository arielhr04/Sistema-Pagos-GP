from fastapi import APIRouter
from datetime import datetime, timezone
import logging

from sqlalchemy import text

from backend.db.session import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["System"])


@router.get("/")
def root():
    return {"message": "Sistema de Gestión de Facturas API"}


@router.get("/health")
def health_check():
    """Health check — verifica que la app y la BD estén operativas."""
    db_status = "connected"
    db_error = None

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = "disconnected"
        db_error = str(e)
        logger.error("Health check — BD no disponible: %s", e)

    status = "healthy" if db_status == "connected" else "unhealthy"
    status_code = 200 if status == "healthy" else 503

    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={
            "status": status,
            "database": db_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **({
                "error": db_error
            } if db_error else {}),
        },
    )