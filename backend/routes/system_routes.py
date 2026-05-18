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
    from backend.db.session import engine
    
    db_status = "connected"
    db_error = None
    pool_info = {}

    try:
        # Usar el engine directamente para obtener conexión del pool
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Información del pool de conexiones
        pool = engine.pool
        pool_info = {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except Exception as e:
        db_status = "disconnected"
        db_error = str(e)[:200]  # Limitar longitud del error
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
            "pool": pool_info if db_status == "connected" else None,
            **({
                "error": db_error
            } if db_error else {}),
        },
    )


@router.post("/db/pool/reset")
def reset_db_pool():
    """🔧 ADMIN: Resetea el pool de conexiones (útil si hay conexiones corruptas)."""
    from backend.db.session import engine
    
    try:
        # Disponer del pool actual y recrear
        engine.dispose()
        logger.info("✅ [DB] Pool de conexiones reseteado")
        
        # Verificar nueva conexión
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        return {
            "status": "success",
            "message": "Pool de conexiones reseteado exitosamente",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"❌ [DB] Error al resetear pool: {e}", exc_info=True)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Error al resetear pool de conexiones: {str(e)[:100]}"
        )