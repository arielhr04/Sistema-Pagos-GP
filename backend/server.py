from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import os
import uuid
import logging
from fastapi.staticfiles import StaticFiles

# Cargar variables de entorno
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Importar configuración y BD al inicio
from backend.core.config import IS_PRODUCTION
from backend.db.session import engine
from backend.db.base import Base

# Importar modelos para que SQLAlchemy los registre
from backend.models.user import User
from backend.models.area import Area
from backend.models.invoice import Invoice
from backend.models.movement import MovementHistory
from backend.models.login_audit import LoginAudit
from backend.models.supervisor_empresa import SupervisorEmpresa

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔵 [STARTUP] Iniciando aplicación...")
    logger.info(f"🔵 [STARTUP] IS_PRODUCTION: {IS_PRODUCTION}")

    try:
        # Verificar conexión a BD
        with engine.connect() as conn:
            logger.info("✅ [DB] Conexión a base de datos exitosa")
    except Exception as e:
        logger.error(f"❌ [DB] Error al conectar a la base de datos: {e}")
        raise

    # Crear tablas
    try:
        logger.info("🔵 [STARTUP] Creando/verificando tablas...")
        Base.metadata.create_all(bind=engine)
        logger.info("✅ [DB] Tablas de base de datos creadas/verificadas")
    except Exception as e:
        logger.error(f"❌ [DB] Error al crear tablas: {e}")
        raise

    # Migrar esquema: agregar columnas nuevas a tablas existentes
    try:
        logger.info("🔵 [SCHEMA] Iniciando migración de esquema...")
        from sqlalchemy import inspect, text as sa_text
        inspector = inspect(engine)
        users_table = "tesoreriapp_gp_users"
        if inspector.has_table(users_table):
            existing_cols = {c["name"] for c in inspector.get_columns(users_table)}
            logger.info(f"🔵 [SCHEMA] Columnas existentes en {users_table}: {existing_cols}")
            if "tour_completed" not in existing_cols:
                with engine.begin() as conn:
                    conn.execute(sa_text(
                        f"ALTER TABLE {users_table} ADD tour_completed BIT NOT NULL DEFAULT 0"
                    ))
                logger.info(f"✅ [SCHEMA] Columna tour_completed añadida a {users_table}")
            else:
                logger.info(f"ℹ️ [SCHEMA] Columna tour_completed ya existe en {users_table}")
        else:
            logger.warning(f"⚠️ [SCHEMA] Tabla {users_table} no encontrada")
    except Exception as e:
        logger.warning(f"⚠️ [SCHEMA] Migración de esquema (tour_completed): {e}")

    # Migrar PDFs legacy a tabla dedicada
    try:
        logger.info("🔵 [DOCS] Iniciando migración de documentos legacy...")
        from backend.db.session import SessionLocal
        from backend.services.invoice_document_service import migrate_legacy_invoice_documents

        db = SessionLocal()
        try:
            stats = migrate_legacy_invoice_documents(db)
            logger.info(
                "✅ [DOCS] Migración completada: escaneadas=%s, migrados=%s, legacy_limpiados=%s",
                stats.get("invoices_scanned", 0),
                stats.get("documents_migrated", 0),
                stats.get("legacy_fields_cleared", 0),
            )
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ [DOCS] Error en migración de documentos legacy: {e}")

    # Auto-seed: crear datos iniciales si la BD está vacía
    try:
        logger.info("🔵 [SEED] Verificando si BD necesita seed...")
        from backend.db.session import SessionLocal
        from backend.models.user import User

        db = SessionLocal()
        user_count = db.query(User).count()
        logger.info(f"🔵 [SEED] Usuarios existentes: {user_count}")

        if user_count == 0:
            logger.info("🔵 [SEED] Base de datos vacía — ejecutando seed automático...")

            from uuid import uuid4
            from datetime import datetime
            from backend.models.area import Area
            from backend.schemas.enums import RoleEnum
            from backend.services.auth_service import hash_password

            now = datetime.utcnow()

            try:
                logger.info("🔵 [SEED] Creando áreas...")
                areas = [
                    Area(id=str(uuid4()), nombre="Finanzas", descripcion="Departamento de Finanzas"),
                    Area(id=str(uuid4()), nombre="Operaciones", descripcion="Departamento de Operaciones"),
                    Area(id=str(uuid4()), nombre="Recursos Humanos", descripcion="Departamento de RRHH"),
                    Area(id=str(uuid4()), nombre="Tecnología", descripcion="Departamento de TI"),
                ]
                db.add_all(areas)
                db.flush()
                logger.info(f"✅ [SEED] {len(areas)} áreas creadas")

                logger.info("🔵 [SEED] Creando usuarios...")
                users = [
                    User(id=str(uuid4()), email="admin@sistema.com", password=hash_password("admin123"),
                         nombre="Administrador Principal", rol=RoleEnum.ADMINISTRADOR.value,
                         empresa_id=None, activo=True, tour_completed=False, created_at=now, updated_at=now),
                    User(id=str(uuid4()), email="tesorero@sistema.com", password=hash_password("tesorero123"),
                         nombre="Tesorero Principal", rol=RoleEnum.TESORERO.value,
                         empresa_id=areas[0].id, activo=True, tour_completed=False, created_at=now, updated_at=now),
                    User(id=str(uuid4()), email="usuario@sistema.com", password=hash_password("usuario123"),
                         nombre="Usuario de Área", rol=RoleEnum.USUARIO_AREA.value,
                         empresa_id=areas[1].id, activo=True, tour_completed=False, created_at=now, updated_at=now),
                    User(id=str(uuid4()), email="supervisor@sistema.com", password=hash_password("supervisor123"),
                         nombre="Supervisor de Finanzas", rol=RoleEnum.SUPERVISOR.value,
                         empresa_id=None, activo=True, tour_completed=False, created_at=now, updated_at=now),
                ]
                db.add_all(users)
                db.flush()
                logger.info(f"✅ [SEED] {len(users)} usuarios creados")

                # Crear relación supervisor-empresa: supervisa Finanzas y Operaciones
                logger.info("🔵 [SEED] Creando relaciones supervisor-empresa...")
                supervisor_rel = [
                    SupervisorEmpresa(id=str(uuid4()), supervisor_id=users[3].id, empresa_id=areas[0].id, created_at=now),
                    SupervisorEmpresa(id=str(uuid4()), supervisor_id=users[3].id, empresa_id=areas[1].id, created_at=now),
                ]
                db.add_all(supervisor_rel)
                db.commit()
                logger.info(f"✅ [SEED] {len(supervisor_rel)} relaciones supervisor-empresa creadas")
                logger.info(f"✅ [SEED] Seed completado: {len(users)} usuarios creados")
            except Exception as seed_error:
                logger.error(f"❌ [SEED] Error durante seed: {seed_error}", exc_info=True)
                db.rollback()
                raise
        else:
            logger.info(f"ℹ️ [SEED] Base de datos con {user_count} usuarios existentes")

        db.close()
    except Exception as e:
        logger.error(f"❌ [SEED] Error en seed automático: {e}", exc_info=True)

    yield
    logger.info("🔴 [SHUTDOWN] Cerrando aplicación...")


# ---------------------------------------------------------------------------
# Crear app FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="Sistema de Gestión de Facturas", lifespan=lifespan)

# CORS — orígenes configurados en .env; vacío = solo mismo origen
cors_origins_raw = os.environ.get("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()] if cors_origins_raw else []
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins if cors_origins else ["*"] if not IS_PRODUCTION else [],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=500)


# ---------------------------------------------------------------------------
# Security headers — protección contra clickjacking, MIME sniffing, etc.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ---------------------------------------------------------------------------
# Error handler global — captura excepciones no manejadas
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Captura errores inesperados, genera ID rastreable y logea el detalle."""
    error_id = f"ERR-{uuid.uuid4().hex[:8]}"
    logger.exception("Error no manejado [%s] %s %s: %s",
                     error_id, request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno del servidor. Referencia: {error_id}"},
    )

# Error handler para validación (422)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Captura errores de validación Pydantic y logea detalles."""
    error_details = exc.errors()
    logger.error(f"❌ [VALIDATION] Error 422 en {request.method} {request.url.path}")
    logger.error(f"❌ [VALIDATION] Errores detectados: {error_details}")
    
    # Construir mensaje de error legible
    error_messages = []
    for error in error_details:
        field = " -> ".join(str(loc) for loc in error.get("loc", [])[1:])  # Saltar el primer elemento (body)
        msg = error.get("msg", "Valor inválido")
        error_messages.append(f"{field}: {msg}" if field else msg)
    
    detail_message = "; ".join(error_messages) if error_messages else "Error de validación"
    logger.error(f"❌ [VALIDATION] Mensaje compilado: {detail_message}")
    
    # Retornar en formato simple que el frontend puede entender
    return JSONResponse(
        status_code=422,
        content={
            "detail": detail_message
        }
    )

# ---------------------------------------------------------------------------
# Registrar routers
# ---------------------------------------------------------------------------
from backend.routes.auth_routes import router as auth_router
from backend.routes.user_routes import router as user_router
from backend.routes.area_routes import router as area_router
from backend.routes.invoice_routes import router as invoice_router
from backend.routes.dashboard_routes import router as dashboard_router
from backend.routes.audit_routes import router as audit_router
from backend.routes.system_routes import router as system_router
from backend.routes.seed_routes import router as seed_router
from backend.routes.notification_routes import router as notification_router

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(area_router)
app.include_router(invoice_router)
app.include_router(dashboard_router)
app.include_router(audit_router)
app.include_router(system_router)
app.include_router(seed_router)
app.include_router(notification_router)

# ---------------------------------------------------------------------------
# Frontend estático + SPA fallback
# ---------------------------------------------------------------------------
frontend_build_path = ROOT_DIR.parent / "frontend" / "build"
if frontend_build_path.exists():
    logger.info("Sirviendo frontend desde: %s", frontend_build_path)

    # Servir archivos estáticos (JS, CSS, images) bajo /static
    app.mount("/static", StaticFiles(directory=str(frontend_build_path / "static")), name="static")
    app.mount("/images", StaticFiles(directory=str(frontend_build_path / "images")), name="images")

    # SPA catch-all: cualquier ruta que NO sea /api/* devuelve index.html
    # Esto permite que React Router maneje /users, /invoices, /dashboard, etc.
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Si el archivo existe en build/, servirlo directamente (favicon, manifest, etc.)
        file_path = frontend_build_path / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        # Para todo lo demás, devolver index.html → React Router decide qué mostrar
        return FileResponse(str(frontend_build_path / "index.html"))
else:
    logger.warning("Frontend build no encontrado en %s", frontend_build_path)

# Ejecución directa
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    logger.info("Iniciando servidor en puerto %s", port)
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)