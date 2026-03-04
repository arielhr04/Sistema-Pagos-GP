#!/bin/bash
# Script de inicio para Railway y otros servicios cloud

# Obtener el puerto desde variable de entorno, default 8080
PORT=${PORT:-8080}

echo "🚀 Iniciando servidor en puerto $PORT"

# Ejecutar uvicorn con el puerto correcto
exec uvicorn backend.server:app --host 0.0.0.0 --port "$PORT"
