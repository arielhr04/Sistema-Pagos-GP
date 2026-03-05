from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import os
import logging
from fastapi.staticfiles import StaticFiles

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# import configuration and database at startup
from backend.db.session import engine
from backend.db.base import Base

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Lifespan event handler (reemplaza @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Iniciando aplicación...")
    
    # Crear tablas
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tablas de base de datos creadas/verificadas")
    
    # Auto-seed: crear usuarios iniciales si la BD está vacía
    try:
        from backend.db.session import SessionLocal
        from backend.models.user import User
        
        db = SessionLocal()
        user_count = db.query(User).count()
        
        if user_count == 0:
            logger.info("📊 Base de datos vacía. Ejecutando seed automático...")
            
            from uuid import uuid4
            from datetime import datetime
            from backend.models.area import Area
            from backend.schemas.enums import RoleEnum
            from backend.services.auth_service import hash_password
            
            now = datetime.utcnow()
            
            # Crear áreas
            areas = [
                Area(id=str(uuid4()), nombre="Finanzas", descripcion="Departamento de Finanzas"),
                Area(id=str(uuid4()), nombre="Operaciones", descripcion="Departamento de Operaciones"),
                Area(id=str(uuid4()), nombre="Recursos Humanos", descripcion="Departamento de RRHH"),
                Area(id=str(uuid4()), nombre="Tecnología", descripcion="Departamento de TI"),
            ]
            db.add_all(areas)
            db.flush()
            
            # Crear usuarios de ejemplo
            users = [
                User(
                    id=str(uuid4()),
                    email="admin@sistema.com",
                    password=hash_password("admin123"),
                    nombre="Administrador Principal",
                    rol=RoleEnum.ADMINISTRADOR.value,
                    area_id=None,
                    activo=True,
                    created_at=now,
                    updated_at=now,
                ),
                User(
                    id=str(uuid4()),
                    email="tesorero@sistema.com",
                    password=hash_password("tesorero123"),
                    nombre="Tesorero Principal",
                    rol=RoleEnum.TESORERO.value,
                    area_id=areas[0].id,
                    activo=True,
                    created_at=now,
                    updated_at=now,
                ),
                User(
                    id=str(uuid4()),
                    email="usuario@sistema.com",
                    password=hash_password("usuario123"),
                    nombre="Usuario de Área",
                    rol=RoleEnum.USUARIO_AREA.value,
                    area_id=areas[1].id,
                    activo=True,
                    created_at=now,
                    updated_at=now,
                ),
            ]
            db.add_all(users)
            db.commit()
            
            logger.info("✅ Seed completado. Usuarios creados:")
            logger.info("   📧 admin@sistema.com : admin123")
            logger.info("   📧 tesorero@sistema.com : tesorero123")
            logger.info("   📧 usuario@sistema.com : usuario123")
        else:
            logger.info(f"✅ Base de datos con {user_count} usuarios existentes")
        
        db.close()
    except Exception as e:
        logger.error(f"⚠️ Error en seed automático: {e}")
    
    yield
    # Shutdown
    logger.info("🛑 Cerrando aplicación...")

app = FastAPI(title="Sistema de Gestión de Facturas", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers AFTER app creation
from backend.routes.auth_routes import router as auth_router
from backend.routes.user_routes import router as user_router
from backend.routes.area_routes import router as area_router
from backend.routes.invoice_routes import router as invoice_router
from backend.routes.dashboard_routes import router as dashboard_router
from backend.routes.audit_routes import router as audit_router
from backend.routes.system_routes import router as system_router
from backend.routes.seed_routes import router as seed_router

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(area_router)
app.include_router(invoice_router)
app.include_router(dashboard_router)
app.include_router(audit_router)
app.include_router(system_router)
app.include_router(seed_router)

# Endpoint de debug (solo en development)
@app.get("/api/debug/users")
def debug_users():
    """Endpoint de debug para ver los usuarios creados. SOLO EN DEVELOPMENT."""
    if os.environ.get("ENV") == "production":
        return {"error": "No disponible en producción"}
    
    from backend.db.session import SessionLocal
    from backend.models.user import User
    
    db = SessionLocal()
    users = db.query(User).all()
    db.close()
    
    return {
        "total_usuarios": len(users),
        "usuarios": [
            {
                "id": u.id,
                "email": u.email,
                "nombre": u.nombre,
                "rol": u.rol,
                "activo": u.activo,
                "password_hash_length": len(u.password) if u.password else 0,
                "password_starts_with": u.password[:20] if u.password else None,
            }
            for u in users
        ],
        "credenciales_de_prueba": {
            "admin": "admin@sistema.com:admin123",
            "tesorero": "tesorero@sistema.com:tesorero123",
            "usuario": "usuario@sistema.com:usuario123",
        }
    }

@app.post("/api/debug/verify-password/{email}/{password}")
def debug_verify_password(email: str, password: str):
    """Endpoint de debug para verificar si una contraseña es correcta."""
    if os.environ.get("ENV") == "production":
        return {"error": "No disponible en producción"}
    
    from backend.db.session import SessionLocal
    from backend.models.user import User
    from backend.services.auth_service import verify_password
    
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    db.close()
    
    if not user:
        return {
            "error": f"Usuario {email} no encontrado",
            "email": email,
            "password_verificada": False
        }
    
    is_valid = verify_password(password, user.password)
    
    return {
        "email": email,
        "usuario_existe": True,
        "usuario_activo": user.activo,
        "password_ingresada": password,
        "password_hash_almacenado": user.password[:30] + "...",
        "password_verificada": is_valid,
        "mensaje": "✅ Contraseña correcta" if is_valid else "❌ Contraseña incorrecta",
        "usuario_nombre": user.nombre,
        "usuario_rol": user.rol
    }

# Montar archivos estáticos del frontend (solo si existen)
frontend_build_path = ROOT_DIR.parent / "frontend" / "build"
if frontend_build_path.exists():
    logger.info(f"📁 Sirviendo frontend desde: {frontend_build_path}")
    app.mount("/", StaticFiles(directory=str(frontend_build_path), html=True), name="frontend")
else:
    logger.warning(f"⚠️ No encontrado: {frontend_build_path} - Frontend no será servido desde el backend")

# Permitir ejecución directa con python
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"🚀 Iniciando servidor en puerto {port}")
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)