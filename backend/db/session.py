from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import logging

from backend.core.config import DATABASE_URL

logger = logging.getLogger(__name__)

logger.info(f"🔵 [DB] Inicializando engine con DATABASE_URL: {DATABASE_URL[:50]}...")

# Pool conservador: 10 conexiones base + 10 overflow = 20 max
# Suficiente para una app interna; evita saturar SQL Server
engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={"timeout": 30},
)

logger.info("✅ [DB] Engine creado exitosamente")

# configured "Session" class
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, class_=Session
)

# Dependency for FastAPI routes

def get_db() -> Generator[Session, None, None]:
    logger.info("🔵 [DB] Obteniendo sesión de base de datos")
    try:
        db = SessionLocal()
        logger.info("✅ [DB] Sesión de base de datos obtenida")
        yield db
    except Exception as e:
        logger.error(f"❌ [DB] Error en sesión de base de datos: {e}", exc_info=True)
        raise
    finally:
        db.close()
        logger.info("ℹ️ [DB] Sesión de base de datos cerrada")