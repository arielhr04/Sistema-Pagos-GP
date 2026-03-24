# Estructura del Proyecto

## Vista General del Árbol

```
Grupo-Gran-Premio/
├── backend/                    # API FastAPI + lógica de negocio
├── frontend/                   # Interfaz React
├── docs/                       # Documentación
├── Dockerfile                  # Containerización
├── requirements.txt            # Dependencias Python
├── .env.example                # Plantilla de variables de entorno
└── README.md                   # Documentación principal
```

---

## Backend

```
backend/
├── __init__.py
├── __main__.py                 # Punto de entrada (python -m backend)
├── server.py                   # Aplicación FastAPI principal
│
├── core/                       # Configuración y utilidades centrales
│   ├── __init__.py
│   ├── config.py               # Variables de entorno (JWT_SECRET, DB_URL, etc)
│   ├── input_validation.py     # Sanitización contra XSS
│   └── rate_limiter.py         # Limitador de intentos de login
│
├── db/                         # Configuración de base de datos
│   ├── __init__.py
│   ├── session.py              # SessionLocal, engine, get_db()
│   └── base.py                 # Clase Base para SQLAlchemy
│
├── models/                     # Modelos ORM (SQLAlchemy)
│   ├── __init__.py
│   ├── user.py                 # Modelo User (id, email, password, rol)
│   ├── area.py                 # Modelo Area (organizaciones)
│   ├── invoice.py              # Modelo Invoice (facturas)
│   ├── movement.py             # Modelo MovementHistory (auditoría)
│   ├── login_audit.py          # Modelo LoginAudit (logs de login)
│   └── invoice_document.py     # Modelo InvoiceDocument (PDFs en BD)
│
├── routes/                     # Endpoints REST agrupados por recurso
│   ├── __init__.py
│   ├── auth_routes.py          # Login, refresh, logout, tour-completed
│   ├── invoice_routes.py       # CRUD facturas, cambiar estatus, upload PDF
│   ├── dashboard_routes.py     # Estadísticas y resumen
│   ├── user_routes.py          # CRUD usuarios (admin)
│   ├── area_routes.py          # CRUD áreas (admin)
│   ├── audit_routes.py         # Logs de cambios
│   ├── notification_routes.py  # Notificaciones
│   ├── system_routes.py        # Health check, etc
│   └── seed_routes.py          # Seed de datos de prueba
│
├── schemas/                    # Validación Pydantic (entrada/salida)
│   ├── __init__.py
│   ├── auth_schemas.py         # LoginRequest, TokenResponse
│   ├── invoice_schemas.py      # InvoiceCreate, InvoiceResponse, StatusUpdate
│   ├── user_schemas.py         # UserCreate, UserResponse
│   ├── area_schemas.py         # AreaCreate, AreaResponse
│   ├── login_audit_schemas.py  # LoginAuditResponse
│   └── enums.py                # RoleEnum, InvoiceStatusEnum
│
├── services/                   # Lógica de negocio (reutilizable)
│   ├── __init__.py
│   ├── auth_service.py         # hash_password, verify_password, JWT creation
│   ├── invoice_service.py      # Lógica compleja de facturas
│   ├── dashboard_service.py    # Cálculo de estadísticas
│   ├── invoice_document_service.py  # Gestión de PDFs en BD
│   ├── cache_service.py        # Caché in-memory con TTL
│   ├── search_service.py       # Búsquedas optimizadas
│   ├── notification_service.py # Notificaciones
│   └── pdf_storage.py          # Compresión y almacenamiento de PDFs
│
├── scripts/                    # Utilidades y migraciones
│   ├── __init__.py
│   └── migrate_pdfs_to_db.py   # Script de migración de PDFs legacy
│
└── uploads/                    # Directorio para archivos uploadados (temp)
```

### Flujo de una Solicitud en Backend

```
Request HTTP
    ↓
routes/ (endpoint: @router.get("/invoices"))
    ↓
get_current_user (autenticación JWT)
    ↓
db: Session = Depends(get_db) (conexión BD)
    ↓
services/ (lógica de negocio)
    ↓
models/ (consultas a BD)
    ↓
Response (serializado con schemas/)
```

---

## Frontend

```
frontend/
├── public/                     # Archivos estáticos
│   ├── index.html
│   └── mockData/               # Datos JSON para demo mode
│       ├── invoices.json       # 5 facturas de prueba
│       ├── areas.json          # 5 áreas
│       └── users.json          # 6 usuarios
│
├── src/
│   ├── index.js                # Punto de entrada React
│   ├── App.js                  # Router y Layout principal
│   ├── App.css
│   ├── index.css               # Estilos globales
│   │
│   ├── components/             # Componentes reutilizables
│   │   ├── Layout.js           # Header + Sidebar (todas las páginas)
│   │   ├── NotificationBell.js # Sistema de notificaciones
│   │   ├── AppTour.js          # Integración react-joyride
│   │   ├── TreasuryReviewNotice.js
│   │   ├── InvoiceDownloadActions.js
│   │   ├── DemoBadge.js        # Badge "DEMO MODE" (optional)
│   │   └── ui/                 # Componentes Shadcn/UI primitivos
│   │       ├── button.jsx
│   │       ├── card.jsx
│   │       ├── dialog.jsx
│   │       ├── input.jsx
│   │       ├── select.jsx
│   │       ├── table.jsx
│   │       └── ... (más componentes)
│   │
│   ├── pages/                  # Páginas lazy-loaded (una por ruta)
│   │   ├── LoginPage.js        # Autenticación
│   │   ├── DashboardPage.js    # Estadísticas + formulario de factura
│   │   ├── InvoicesPage.js     # Tabla completa de facturas
│   │   ├── KanbanPage.js       # Drag & drop visual
│   │   ├── UsersPage.js        # CRUD usuarios (admin)
│   │   ├── AreasPage.js        # CRUD áreas (admin)
│   │   └── AuditPage.js        # Logs de cambios
│   │
│   ├── context/                # Estado global (Context API)
│   │   ├── AuthContext.js      # Token, usuario, autenticación
│   │   ├── DemoContext.js      # Contexto para badge demo (opcional)
│   │   └── TourContext.js      # Demo mode, demoData, tour activo
│   │
│   ├── hooks/                  # Hooks personalizados
│   │   └── use-toast.js        # Sistema de toast notifications
│   │
│   ├── services/               # Lógica de llamadas HTTP
│   │   ├── mockDataService.js  # Carga mock data desde JSON
│   │   └── (apiClient.js preparado para futura mejora)
│   │
│   └── lib/                    # Utilidades sin estado
│       ├── apiCache.js         # Caché local de respuestas API
│       ├── date.js             # Utilidades de fechas
│       └── utils.js            # Funciones genéricas (format, sort, etc)
│
├── package.json                # Dependencias (React, Shadcn, Tailwind, etc)
├── package-lock.json
├── Dockerfile                  # Containerización Node
├── postcss.config.js           # Configuración Tailwind
├── tailwind.config.js          # Tema y personalización
├── jsconfig.json               # Path aliases
└── README.md                   # Instrucciones frontend
```

### Flujo de una Página en Frontend

```
App.js → ProtectedRoute → page/DashboardPage.js
    ↓
useAuth() (leer token, usuario)
useTour() (ver si está en demo mode)
    ↓
useEffect() → fetchData()
    ↓
if (demoMode && demoData) → usar mock
else → axios.get("/api/...")
    ↓
setData() → re-render
    ↓
JSX → Shadcn components → Render
```

---

## Flujos Importantes

### 1️⃣ Autenticación

```
LoginPage
    ↓ POST /api/auth/login
server.py routes/auth_routes.py
    ↓
auth_service.verify_password (bcrypt)
    ↓
create_token (JWT access + refresh)
    ↓
Guardar en localStorage (frontend)
    ↓
useAuth.login() → AuthContext.setToken()
```

### 2️⃣ Crear Factura

```
DashboardPage (Usuario Área)
    ↓ POST /api/invoices (multipart form-data: PDF)
server.py routes/invoice_routes.py
    ↓
input_validation.sanitize_text() (XSS protection)
    ↓
validate_pdf_upload() (tamaño, extensión)
    ↓
compress_pdf_safe() (reducir tamaño)
    ↓
Invoice model → upsert_invoice_document() (guardar PDF en BD)
    ↓
log_movement() (auditoría)
    ↓
Notificación en tiempo real → Tesorero
```

### 3️⃣ Demo Mode para Tours

```
AppTour.js → startTour()
    ↓ (TourContext)
Promise.all [
    getMockInvoices(),
    getMockAreas(),
    getMockUsers(),
    ...getMockDashboardStats(),
    getMockAuditLogs(),
    getMockLoginLogs()
]
    ↓
setDemoData() → setDemoMode(true)
    ↓
KanbanPage.fetchColumn()
    if (demoMode && demoData?.invoices)
        → retorna datos mock (150ms delay)
    else
        → axios.get("/api/invoices")
    ↓
Kanban renderiza columnas sin API latency
```

---

## Base de Datos

```
tesoreriapp_gp_users
├── id (PK, UUID)
├── email (UNIQUE)
├── password (bcrypt)
├── nombre
├── rol (Usuario Área, Tesorero, Administrador)
├── area_id (FK → tesoreriapp_gp_areas)
├── activo (boolean)
├── tour_completed (boolean)
├── created_at, updated_at

tesoreriapp_gp_areas
├── id (PK, UUID)
├── nombre
└── descripcion

tesoreriapp_gp_invoices
├── id (PK, UUID)
├── folio_fiscal (UNIQUE)
├── nombre_proveedor
├── descripcion_factura
├── monto
├── estatus (Capturada, En revisión, Programada, Pagada, Rechazada)
├── fecha_vencimiento
├── area_procedencia (FK)
├── created_by (FK → Users)
├── pdf_data (BLOB, deferred)
└── created_at, updated_at

tesoreriapp_gp_movement_history (Auditoría)
├── id (PK, UUID)
├── invoice_id (FK)
├── usuario_id (FK)
├── accion (ej: "cambió estatus a Pagada")
├── estatus_anterior, estatus_nuevo
└── timestamp

tesoreriapp_gp_login_audit
├── id (PK, UUID)
├── usuario_id (FK)
├── timestamp
├── ip_address
└── resultado (success, failed)
```

Índices en columnas frecuentes:
- `tesoreriapp_gp_invoices.estatus`
- `tesoreriapp_gp_invoices.fecha_vencimiento`
- `tesoreriapp_gp_invoices.folio_fiscal`
- `tesoreriapp_gp_users.email`
- `tesoreriapp_gp_users.rol`

---

## Convenciones

### Backend (Python)

**Nombres:**
- Funciones/variables: `snake_case`
- Clases: `PascalCase`
- Constantes: `UPPER_SNAKE_CASE`

**Estructura:**
```python
# 1. Imports
from typing import Optional
from sqlalchemy.orm import Session

# 2. Funciones auxi
def helper():
    pass

# 3. Funciones principales
def main_function():
    pass

# 4. Docstring si es publica
"""
Documentación...
"""
```

**Docstrings:**
```python
def search_invoices(db: Session, term: str) -> List[Invoice]:
    """
    Buscar facturas por término.
    
    Args:
        db: Sesión SQLAlchemy
        term: Término de búsqueda
        
    Returns:
        Lista de facturas encontradas
    """
```

### Frontend (JavaScript)

**Nombres:**
- Variables/funciones: `camelCase`
- Componentes: `PascalCase`
- Constantes: `UPPER_SNAKE_CASE`

**Estructura:**
```javascript
import { useState, useEffect } from 'react';

// Constantes
const API_URL = process.env.REACT_APP_BACKEND_URL;

// Componente
export default function MyComponent() {
  const [state, setState] = useState();
  
  useEffect(() => {
    // Side effects
  }, []);
  
  const handleClick = () => {
    // Event handlers
  };
  
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

**JSDoc:**
```javascript
/**
 * Carga facturas de la API.
 * 
 * @param {string} estatus - Estado a filtrar
 * @param {number} page - Número de página
 * @returns {Promise<Array>} Lista de facturas
 * @throws {Error} Si falla la conexión
 */
async function fetchInvoices(estatus, page = 1) {
  // ...
}
```

---

## Dependencias Claves

### Backend

| Paquete | Versión | Uso |
|---------|---------|-----|
| `fastapi` | 0.110.1 | Framework REST |
| `uvicorn` | 0.25.0 | ASGI server |
| `sqlalchemy` | 2.0+ | ORM BD |
| `pydantic` | 2.12.5 | Validación datos |
| `PyJWT` | 2.11.0 | Tokens JWT |
| `bcrypt` | 4.1.3 | Hashing contraseñas |
| `python-multipart` | 0.0.22 | Upload archivos |

### Frontend

| Paquete | Versión | Uso |
|---------|---------|-----|
| `react` | 18 | Framework UI |
| `react-router-dom` | Latest | Routing |
| `shadcn/ui` | Latest | Componentes UI |
| `tailwindcss` | 3.3.0+ | Estilos |
| `@dnd-kit/core` | 6.3.1 | Drag & drop |
| `react-joyride` | Latest | Tours |
| `axios` | 1.8.4+ | HTTP client |
| `date-fns` | 3.6.0 | Fechas |

---

## Puntos de Extensión

Para agregar nuevas features:

1. **Nuevo modelo**: 
   - Crear en `backend/models/`
   - Agregar a `backend/db/base.py`
   - Crear schema en `backend/schemas/`
   - Crear servicio en `backend/services/`
   - Crear ruta en `backend/routes/`

2. **Nueva página**:
   - Crear componente en `frontend/src/pages/`
   - Agregar ruta en `frontend/src/App.js`
   - Agregar en sidebar (`Layout.js`)
   - Crear mock data si necesita demo mode

3. **Nuevo estado global**:
   - Crear contexto en `frontend/src/context/`
   - Exportar provider y hook
   - Usar en componentes con `useContexto()`

---

Esta estructura permite escalarlidad y mantenibilidad a largo plazo.
