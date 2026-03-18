# Grupo Gran Premio - Sistema de Gestión de Facturas

Plataforma web para gestión integral de facturas en la empresa. Los usuarios (según su rol) pueden registrar, revisar y procesar pagos de facturas.

## Tech Stack

Estamos usando:

**Backend**
- FastAPI + SQLAlchemy (ORM para SQL Server)
- JWT para autenticación (access tokens + refresh)
- Bcrypt para contraseñas
- Rate limiting en login (contra brute force)

**Frontend**
- React 18 con Shadcn/UI components
- Tailwind para estilos
- react-joyride para tours
- @dnd-kit para drag & drop en el Kanban

## Antes de Empezar

Necesitas:
- Node.js 18 o superior
- Python 3.11+
- SQL Server 2019+ (o Azure SQL)
- Git

## 🚀 Inicio Rápido (5 minutos)

### 1️⃣ Clonar y Setup del Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r ../requirements.txt
cp ../.env.example .env  # Configurar variables de entorno
python -m backend.server
```

El servidor estará en `http://localhost:8000`

Swagger docs: `http://localhost:8000/api/docs`

### 2️⃣ Setup del Frontend

```bash
cd frontend
npm install
npm start
```

La aplicación se abrirá en `http://localhost:3000`

### 3️⃣ Credenciales de Prueba

Auto-generadas en la primera ejecución:

- **Usuario Área**: usuario@area.com / demo123
- **Tesorero**: tesorero@demo.com / demo123
- **Administrador**: admin@demo.com / demo123

## 🎨 Características Principales

### 📱 Dashboard
- Estadísticas en tiempo real (facturas pendientes, vencidas, pagadas)
- Carga rápida con caché inteligente
- Vista personalizada por rol

### 📄 Gestión de Facturas
- CRUD completo de facturas
- 5 estados: Capturada → En revisión → Programada → Pagada/Rechazada
- Upload de PDFs con compresión automática
- Búsqueda avanzada con filtros

### 🎪 Panel Kanban
- Drag & drop visual entre estados
- Gestión en tiempo real
- Resumen de montos por columna

### 👥 Gestión de Usuarios y Áreas
- CRUD de usuarios con asignación de roles
- Gestión de áreas organizacionales
- Control de permisos granular

### 📊 Auditoría
- Registro de todos los cambios (quién, cuándo, qué)
- Logs de login
- Trazabilidad completa

### 🎓 Sistema de Tours Interactivos
- Tours por rol (Usuario Área, Tesorero, Administrador)
- Modo demo con mock data precargada
- Sin impacto en BD real (session-local)

## 🔐 Seguridad

- ✅ Autenticación JWT con tokens de corta vida (15 min)
- ✅ Refresh tokens con vida larga (7 días)
- ✅ Rate limiting contra fuerza bruta (5 intentos/15 min)
- ✅ Validación y sanitización de entrada contra XSS
- ✅ Control de acceso basado en roles (RBAC)
- ✅ CORS configurado
- ⚠️ Usar HTTPS en producción

## 📁 Estructura del Proyecto

```
Grupo-Gran-Premio/
├── backend/
│   ├── core/              # Configuración y utilidades
│   │   ├── config.py      # Variables de entorno
│   │   ├── input_validation.py
│   │   └── rate_limiter.py
│   ├── db/                # Sesiones y base de datos
│   ├── models/            # Modelos ORM (User, Invoice, Area, etc)
│   ├── routes/            # Endpoints REST
│   ├── schemas/           # Validación Pydantic
│   ├── services/          # Lógica de negocio
│   ├── scripts/           # Migraciones y utilidades
│   └── server.py          # Aplicación FastAPI
│
├── frontend/
│   ├── public/
│   │   └── mockData/      # Datos para demo mode
│   └── src/
│       ├── components/    # Componentes React reutilizables
│       ├── pages/         # Páginas lazy-loaded
│       ├── context/       # Estado global (Auth, Tour)
│       ├── services/      # Llamadas HTTP y caché
│       └── lib/           # Utilidades (fechas, formato)
│
├── docs/                  # Documentación del proyecto
├── Dockerfile             # Containerización
├── requirements.txt       # Dependencias Python
└── README.md             # Este archivo
```

Ver [ESTRUCTURA.md](docs/ESTRUCTURA.md) para detalles completos.

## Desarrollo Local

Necesitas 2 terminales:

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate
python -m backend.server
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm start
```

Crear `.env` en la raíz:
```
DATABASE_URL=mssql+pyodbc://user:pass@server/db?driver=ODBC+Driver+17+for+SQL+Server
JWT_SECRET=algo-seguro-cambiar-en-prod
REFRESH_SECRET=otro-secreto-cambiar-en-prod
CORS_ORIGINS=http://localhost:3000
ENV=development
```

## 🐳 Docker

### Construir imagen
```bash
docker build -t grupo-gran-premio .
```

### Ejecutar contenedor
```bash
docker run -p 8000:8000 -p 3000:3000 \
  -e DATABASE_URL="mssql://..." \
  -e JWT_SECRET="..." \
  grupo-gran-premio
```

Ver [SETUP.md](docs/SETUP.md) para setup completo con Docker Compose.

## Docker

```bash
docker build -t gp .
docker run -p 8000:8000 -p 3000:3000 -e DATABASE_URL="..." gp
```

Ver [SETUP.md](docs/SETUP.md) para Docker Compose.

## API Docs

Swagger en `http://localhost:8000/api/docs` cuando el backend está corriendo.

## Qué Puede Hacer Cada Rol

- **Usuario Área**: Registrar sus facturas, ver estado
- **Tesorero**: Ver todas las facturas, cambiar estados, usar Kanban, aprobar pagos
- **Admin**: Gestionar usuarios, áreas, ver auditoríaactual
- Capturas de pantalla si es relevante

## 📄 Licencia

Privado - Uso interno únicamente

## 📞 Contacto

Para preguntas o soporte, contactar al equipo de desarrollo.

---
Contribuir

Lee [CONTRIBUIR.md](CONTRIBUIR.md) si quieres ayudar.

Básicamente:
1. Haz una rama para tu feature
2. Commits pequeños
3. Push y abre PR
4. Espera que revisen

## Issues

Si encuentras algo roto:
- Abre un issue describiendo qué falla
- Dale reproducir exacto si es posible

## Licencia

Privado - código interno.