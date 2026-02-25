from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path
import os
import logging


# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

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
from routes.auth_routes import router as auth_router
from routes.user_routes import router as user_router
from routes.area_routes import router as area_router
from routes.invoice_routes import router as invoice_router
from routes.dashboard_routes import router as dashboard_router
from routes.audit_routes import router as audit_router
from routes.system_routes import router as system_router
from routes.seed_routes import router as seed_router

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

@app.on_event("shutdown")
async def shutdown_event():
    from database import client
    client.close()

