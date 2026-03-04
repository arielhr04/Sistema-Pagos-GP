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
    if os.environ.get("ENV", "development") == "development":
        Base.metadata.create_all(bind=engine)
    logger.info("✅ Tablas de base de datos creadas/verificadas")
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