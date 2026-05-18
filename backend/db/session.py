from sqlalchemy import create_engine, event, exc
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import Pool
from typing import Generator
import logging
import time
from fastapi import HTTPException

from backend.core.config import DATABASE_URL

logger = logging.getLogger(__name__)

logger.info(f"🔵 [DB] Inicializando engine con DATABASE_URL: {DATABASE_URL[:50]}...")

# Pool optimizado para Railway/Cloud con reconexión agresiva
# Recycle cada 5 min para evitar conexiones stale
# Pre-ping verifica conexión antes de usar
engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=10,
    pool_pre_ping=True,  # Verifica conexión antes de usar
    pool_recycle=300,     # 5 minutos (era 30) - más agresivo para Railway
    pool_timeout=30,      # Timeout al obtener conexión del pool
    connect_args={
        "timeout": 30,
        "connect_timeout": 30,
    },
)

# Event listener para detectar reconexiones
@event.listens_for(Pool, "connect")
def receive_connect(dbapi_conn, connection_record):
    logger.info("🔌 [DB] Nueva conexión establecida")

@event.listens_for(Pool, "checkout")
def receive_checkout(dbapi_conn, connection_record, connection_proxy):
    # Silencioso - solo para debug si es necesario
    pass

logger.info("✅ [DB] Engine creado exitosamente")

# configured "Session" class
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, class_=Session
)

# Dependency for FastAPI routes con retry logic

def get_db() -> Generator[Session, None, None]:
    """Obtiene sesión de DB con retry automático en caso de pérdida de conexión."""
    max_retries = 3
    retry_delay = 0.5  # segundos
    
    for attempt in range(max_retries):
        try:
            db = SessionLocal()
            try:
                yield db
                db.commit()  # Commit si todo salió bien
                break  # Salir del loop de retry
            except HTTPException:
                # HTTPException es esperada (ej: token expirado, unauthorized)
                # No es un error de DB, re-raise sin loggear como error de DB
                db.rollback()
                raise
            except exc.OperationalError as e:
                db.rollback()
                # Error de conexión - intentar retry
                if "08S01" in str(e) or "Connection" in str(e):
                    if attempt < max_retries - 1:
                        logger.warning(
                            f"⚠️ [DB] Pérdida de conexión (intento {attempt + 1}/{max_retries}). "
                            f"Reintentando en {retry_delay}s..."
                        )
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Backoff exponencial
                        continue
                    else:
                        logger.error(
                            f"❌ [DB] Error de conexión persistente después de {max_retries} intentos: {e}",
                            exc_info=True
                        )
                        raise HTTPException(
                            status_code=503,
                            detail="Servicio temporalmente no disponible. Por favor intente nuevamente."
                        )
                else:
                    logger.error(f"❌ [DB] Error operacional: {e}", exc_info=True)
                    raise
            except Exception as e:
                db.rollback()
                logger.error(f"❌ [DB] Error inesperado: {e}", exc_info=True)
                raise
            finally:
                db.close()
        except HTTPException:
            # Re-raise HTTPException sin envolver
            raise
        except Exception as e:
            if attempt >= max_retries - 1:
                raise