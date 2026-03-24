FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

# instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    unixodbc \
    unixodbc-dev \
    gcc \
    g++ \
    apt-transport-https \
    ca-certificates \
    tesseract-ocr \
    libtesseract-dev

# agregar repositorio Microsoft
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg

RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release.list

# instalar driver SQL Server
RUN apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17

# instalar dependencias python (en capa cacheable)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# copiar proyecto
COPY . .

# copiar build de frontend generado en etapa anterior
COPY --from=frontend-builder /frontend/build ./frontend/build

# puerto Railway (importante: Railway inyecta PORT automáticamente)
ENV PORT=8080

# iniciar FastAPI usando el módulo backend
CMD ["python", "-m", "backend"]