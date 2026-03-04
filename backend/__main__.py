"""
Punto de entrada principal para ejecutar el servidor FastAPI.
Uso: python -m backend
"""
import os
import uvicorn
import logging

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    # Leer el puerto de la variable de entorno PORT (Railway lo inyecta automáticamente)
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"🚀 Iniciando servidor en HOST=0.0.0.0 PORT={port}")
    
    # Ejecutar uvicorn
    uvicorn.run(
        "backend.server:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
