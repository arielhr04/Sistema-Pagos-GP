FROM python:3.11-slim

WORKDIR /app

# instalar dependencias del sistema para SQL Server
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    unixodbc \
    unixodbc-dev \
    curl \
    gnupg \
    apt-transport-https \
    ca-certificates

# instalar driver Microsoft ODBC
RUN curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
 && curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list \
 && apt-get update \
 && ACCEPT_EULA=Y apt-get install -y msodbcsql17

# copiar proyecto
COPY . .

# instalar python deps
RUN pip install --no-cache-dir -r requirements.txt

# puerto
ENV PORT=8080

# comando inicio
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8080"]