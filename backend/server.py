from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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

app = FastAPI(title="Sistema de Gestión de Facturas")

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

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
def startup_event():
    # create tables when running in development
    if os.environ.get("ENV", "development") == "development":
        Base.metadata.create_all(bind=engine)

@app.on_event("shutdown")
def shutdown_event():
    # no Mongo client to close anymore
    pass

app.mount("/", StaticFiles(directory="../frontend/build", html=True), name="frontend")