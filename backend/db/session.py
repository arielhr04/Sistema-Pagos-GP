from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from core.config import DATABASE_URL

# Create the SQLAlchemy engine for SQL Server with robust connection pooling
engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_size=20,              # Aumentar tamaño del pool
    max_overflow=40,           # Permitir conexiones temporal si es necesario
    pool_pre_ping=True,        # Validar conexión antes de usar (detecta stale connections)
    pool_recycle=3600,         # Reciclar conexiones después de 1 hora
    connect_args={"timeout": 30}  # Timeout de 30 segundos
)

# configured "Session" class
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, class_=Session
)

# Dependency for FastAPI routes

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()