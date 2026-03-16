import os
import logging
from dotenv import load_dotenv

# Cargar variables de entorno desde .env en la raíz del proyecto
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

# Entorno de ejecución: "development" o "production"
ENV = os.environ.get("ENV", "development")
IS_PRODUCTION = ENV == "production"

# URL de conexión a SQL Server (obligatoria)
DATABASE_URL = os.environ.get("DATABASE_URL")

# JWT: secreto obligatorio — la app no arranca sin él
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    if IS_PRODUCTION:
        raise RuntimeError("JWT_SECRET es obligatorio en producción. Configurar en variables de entorno.")
    JWT_SECRET = "dev-only-secret-DO-NOT-USE-IN-PROD"
    logger.warning("JWT_SECRET no configurado — usando secreto de desarrollo. NO usar en producción.")

# Refresh token secret (distinto al access token)
REFRESH_SECRET = os.environ.get("REFRESH_SECRET")
if not REFRESH_SECRET:
    if IS_PRODUCTION:
        raise RuntimeError("REFRESH_SECRET es obligatorio en producción.")
    REFRESH_SECRET = "dev-refresh-secret-DO-NOT-USE-IN-PROD"
    logger.warning("REFRESH_SECRET no configurado — usando secreto de desarrollo.")

# CORS: orígenes permitidos (vacío = solo mismo origen)
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "")
