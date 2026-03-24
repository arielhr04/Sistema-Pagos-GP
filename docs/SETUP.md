# Guía Completa de Setup

## Tabla de Contenidos
1. [Setup Local](#setup-local)
2. [Setup con Docker](#setup-con-docker)
3. [Setup en Producción](#setup-en-producción)
4. [Solución de Problemas](#solución-de-problemas)

---

## Setup Local

### Requisitos Previos

- **Python 3.11+**
  ```bash
  python --version  # Verificar versión
  ```

- **Node.js 18+**
  ```bash
  node --version
  npm --version
  ```

- **SQL Server 2019+** o Azure SQL
  - Driver ODBC 17 para SQL Server instalado
  ```bash
  # Verificar en Windows
  odbcconf /s /a {REGSVR "C:\Program Files\Microsoft ODBC Driver 17 for SQL Server\msodbcsql.dll"}
  ```

### Clonar Repositorio

```bash
git clone <url-repositorio>
cd Grupo-Gran-Premio
```

### Configurar Backend

#### A. Crear entorno virtual

```bash
cd backend

# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

#### B. Instalar dependencias

```bash
pip install --upgrade pip
pip install -r ../requirements.txt
```

#### C. Configurar variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp ../.env.example .env  # Linux/Mac
copy ..\\.env.example .env  # Windows PowerShell
```

Editar `.env` con tus valores:

```env
# Base de datos SQL Server
DATABASE_URL=mssql+pyodbc://sa:TuContraseña@localhost/GrupoPremio?driver=ODBC+Driver+17+for+SQL+Server

# Autenticación (cambiar en producción!)
JWT_SECRET=secreto-desarrollo-123-cambiar-en-prod
REFRESH_SECRET=refresh-secreto-456-cambiar-en-prod

# CORS
CORS_ORIGINS=http://localhost:3000

# Ambiente
ENV=development
```

#### D. Verificar conexión BD

```bash
python -c "
from backend.db.session import engine
try:
    with engine.connect() as conn:
        print('Conexión a BD exitosa')
except Exception as e:
    print(f'Error: {e}')
"
```

#### E. Iniciar servidor

```bash
# Estando en carpeta backend/ con venv activado
python -m backend.server
```

Debería ver:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

**Verificar:**
- Swagger: https://localhost:8000/api/docs
- Health check: GET http://localhost:8000/api/health

---

### Configurar Frontend

#### A. Instalar dependencias

```bash
cd frontend
npm install
```

#### B. Variables de entorno (opcional)

Crear `.env.local` en `frontend/`:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
REACT_APP_API_TIMEOUT=30000
```

Si no está, asume por defecto `http://localhost:8000`

#### C. Iniciar servidor de desarrollo

```bash
npm start
```

Se abrirá automáticamente en `http://localhost:3000`

#### D. Build para producción

```bash
npm run build
# Genera carpeta 'build/' lista para deploy
```

---

## Setup con Docker

### Requisitos

- Docker Desktop instalado
- Docker Compose 2.0+

### Crear docker-compose.yml

En la raíz del proyecto:

```yaml
version: '3.8'

services:
  # Base de datos
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2019-latest
    environment:
      ACCEPT_EULA: Y
      SA_PASSWORD: YourStrongPassword123
    ports:
      - "1433:1433"
    volumes:
      - sqlserver_data:/var/opt/mssql

  # Backend
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: mssql+pyodbc://sa:YourStrongPassword123@sqlserver:1433/GrupoPremio?driver=ODBC+Driver+17+for+SQL+Server
      JWT_SECRET: dev-secret-123
      REFRESH_SECRET: dev-refresh-456
      CORS_ORIGINS: http://localhost:3000
      ENV: development
    depends_on:
      - sqlserver
    volumes:
      - ./backend:/app/backend

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      REACT_APP_BACKEND_URL: http://localhost:8000
    depends_on:
      - backend
    volumes:
      - ./frontend/src:/app/src

volumes:
  sqlserver_data:
```

### Ejecutar con Docker Compose

```bash
# Construir imágenes
docker-compose build

# Iniciar servicios
docker-compose up

# En otra terminal, ejecutar migraciones
docker-compose exec backend python -m backend.scripts.seed
```

Acceder a:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **Swagger**: http://localhost:8000/api/docs

### Detener servicios

```bash
docker-compose down

# Con limpieza de volúmenes
docker-compose down -v
```

---

## Setup en Producción

### Servidor Linux (Ubuntu 20.04+)

#### A. Instalar dependencias del sistema

```bash
sudo apt update
sudo apt install -y \
  python3.11 \
  python3.11-venv \
  python3.11-dev \
  nodejs \
  npm \
  curl \
  git

# Driver ODBC para SQL Server
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
sudo curl https://packages.microsoft.com/config/ubuntu/20.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update
sudo apt install -y msodbcsql17
```

#### B. Clonar y preparar aplicación

```bash
cd /opt
sudo git clone <repo-url> grupo-gran-premio
cd grupo-gran-premio
sudo chown -R $USER:$USER .
```

#### C. Setup Backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r ../requirements.txt
```

#### D. Variables de entorno (SEGURO)

```bash
# Usar variables de entorno del sistema en lugar de .env
export DATABASE_URL="mssql://..."
export JWT_SECRET="$(openssl rand -hex 32)"
export REFRESH_SECRET="$(openssl rand -hex 32)"
export CORS_ORIGINS="https://tudominio.com"
export ENV="production"
```

#### E. Setup Frontend

```bash
cd frontend
npm install --production
npm run build
```

### Servir con Gunicorn + Nginx

#### A. Instalar Gunicorn

```bash
pip install gunicorn
```

#### B. Crear systemd service

`/etc/systemd/system/grupo-premio-backend.service`:

```ini
[Unit]
Description=Grupo Gran Premio Backend
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/opt/grupo-gran-premio/backend
Environment="PATH=/opt/grupo-gran-premio/backend/venv/bin"
ExecStart=/opt/grupo-gran-premio/backend/venv/bin/gunicorn \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --timeout 120 \
    backend.server:app

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Habilitar servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable grupo-premio-backend
sudo systemctl start grupo-premio-backend
sudo systemctl status grupo-premio-backend
```

#### C. Nginx como reverse proxy

`/etc/nginx/sites-available/grupo-premio`:

```nginx
upstream backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name tudominio.com www.tudominio.com;
    
    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tudominio.com www.tudominio.com;

    # SSL (usar Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;

    # Frontend estático
    location / {
        root /opt/grupo-gran-premio/frontend/build;
        try_files $uri /index.html;
    }

    # API Backend
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilitar:

```bash
sudo ln -s /etc/nginx/sites-available/grupo-premio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### D. SSL con Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d tudominio.com -d www.tudominio.com
```

### Monitoreo y Logs

```bash
# Ver logs del backend
sudo journalctl -u grupo-premio-backend -f

# Ver logs de Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Health check
curl https://tudominio.com/api/health
```

### Backups de BD

```bash
# Crear backup SQL Server
# Usando sqlcmd
sqlcmd -S servidor -U sa -P contraseña \
  -Q "BACKUP DATABASE [GrupoPremio] TO DISK='/backups/gp.bak'"

# Programar con cron (diariamente a las 2 AM)
0 2 * * * /ruta/a/script-backup.sh
```

---

## Solución de Problemas

### Error: "pyodbc.Error: ('08001', '[08001]..."

**Causa**: No puede conectarse a SQL Server

**Solución**:
```bash
# Verificar que SQL Server está corriendo
# Windows: Services → SQL Server

# Verificar driver ODBC
python -c "import pyodbc; print(pyodbc.drivers())"

# Probar conexión
sqlcmd -S localhost -U sa -P contraseña
```

### Error: "ModuleNotFoundError: No module named 'backend'"

**Causa**: Python path incorrecto

**Solución**:
```bash
# Ejecutar desde la carpeta backend CON venv activado
cd backend
source venv/bin/activate  # o venv\Scripts\activate en Windows
python -m backend.server
```

### Frontend no conecta al backend

**Causa**: CORS bloqueado o URL incorrecta

**Solución**:
```bash
# Verificar CORS_ORIGINS en .env
echo $CORS_ORIGINS  # Linux/Mac
echo %CORS_ORIGINS%  # Windows

# Debe incluir http://localhost:3000 en dev
CORS_ORIGINS=http://localhost:3000
```

### Puerto 8000 o 3000 ya en uso

**Solución**:
```bash
# Ver qué está usando el puerto (Linux/Mac)
lsof -i :8000
lsof -i :3000

# Cambiar puerto en .env o en la ejecución
python -m backend.server --port 8001
npm start -- --port 3001
```

---

## Comandos Útiles

```bash
# Recrear BD (limpia todo)
python -c "
from backend.db.session import engine
from backend.db.base import Base
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
print('BD recreada')
"

# Seed de datos de prueba
python -m backend.scripts.seed

# Verificar logs
tail -f backend.log

# Limpiar caché
python -c "from backend.services.cache_service import clear_cache; clear_cache(); print('Cache limpiado')"
```

---

**¿Problemas?** Contactar al equipo de desarrollo o revisar logs en `backend.log`
