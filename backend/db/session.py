from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from backend.core.config import DATABASE_URL

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