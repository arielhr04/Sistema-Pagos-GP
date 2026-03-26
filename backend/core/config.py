import os
import logging
from dotenv import load_dotenv

# Cargar variables de entorno desde .env en la raíz del proyecto
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)
logger.info("🔵 [CONFIG] Cargando configuración...")

# Entorno de ejecución: "development" o "production"
ENV = os.environ.get("ENV", "development")
IS_PRODUCTION = ENV == "production"
logger.info(f"🔵 [CONFIG] ENV: {ENV}, IS_PRODUCTION: {IS_PRODUCTION}")

# URL de conexión a SQL Server (obligatoria)
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    # Mascarar la URL por seguridad en logs
    masked_url = DATABASE_URL[:30] + "..." if len(DATABASE_URL) > 30 else DATABASE_URL
    logger.info(f"✅ [CONFIG] DATABASE_URL configurada: {masked_url}")
else:
    logger.error("❌ [CONFIG] DATABASE_URL NO está configurada")

# JWT: secreto obligatorio — la app no arranca sin él
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    if IS_PRODUCTION:
        logger.error("❌ [CONFIG] JWT_SECRET es obligatorio en producción")
        raise RuntimeError("JWT_SECRET es obligatorio en producción. Configurar en variables de entorno.")
    JWT_SECRET = "dev-only-secret-DO-NOT-USE-IN-PROD"
    logger.warning("⚠️ [CONFIG] JWT_SECRET no configurado — usando secreto de desarrollo. NO usar en producción.")
else:
    logger.info("✅ [CONFIG] JWT_SECRET configurado")

# Refresh token secret (distinto al access token)
REFRESH_SECRET = os.environ.get("REFRESH_SECRET")
if not REFRESH_SECRET:
    if IS_PRODUCTION:
        logger.error("❌ [CONFIG] REFRESH_SECRET es obligatorio en producción")
        raise RuntimeError("REFRESH_SECRET es obligatorio en producción.")
    REFRESH_SECRET = "dev-refresh-secret-DO-NOT-USE-IN-PROD"
    logger.warning("⚠️ [CONFIG] REFRESH_SECRET no configurado — usando secreto de desarrollo.")
else:
    logger.info("✅ [CONFIG] REFRESH_SECRET configurado")

# CORS: orígenes permitidos (vacío = solo mismo origen)
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "")
logger.info(f"🔵 [CONFIG] CORS_ORIGINS: {CORS_ORIGINS if CORS_ORIGINS else '(vacío - mismo origen)'}")
