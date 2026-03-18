# Demo Mode - Tour de Demostración Fluido

## 📋 Descripción

Este sistema proporciona **datos mock instantáneos** cuando el usuario inicia un tour de demostración. Así el tour es completamente **fluido sin latencia** de API.

## 🏗️ Arquitectura

### 1. **JSON Mock Data** (`/public/mockData/`)
- `invoices.json` - 5 facturas de demostración con estados variados
- `areas.json` - 5 áreas organizacionales
- `users.json` - 6 usuarios con diferentes roles

### 2. **mockDataService.js** - Carga datos JSON
```javascript
// Carga todos los JSON en memoria (una sola vez)
const data = await getMockInvoices(); // Retorna Array con paginación
const areas = await getMockAreas();
const stats = await getMockDashboardStats();
```

### 3. **apiClient.js** - Interceptor API con Demo Mode
```javascript
// Cuando demoMode = true, retorna datos mock
// Cuando demoMode = false, hace llamadas reales
const invoices = await apiClient.getInvoices(params, authHeader);
```

### 4. **TourContext.js** - Orquesta todo
```javascript
// Cuando el usuario clickea "Iniciar Tour"
startTour() → 
  ✓ Setea demoMode = true
  ✓ Precarga datos mock en paralelo
  ✓ Sincroniza con apiClient
  ✓ Tour comienza con datos listos

// Cuando termina el tour
completeTour() →
  ✓ Setea demoMode = false
  ✓ Limpia datos mock
```

## 🚀 Cómo Usarlo

### En componentes que usan datos (Ejemplo: InvoicesPage)

**OPCIÓN 1: Usar apiClient (Recomendado si refactorizas)**
```javascript
import apiClient from '../lib/apiClient';

// En tu fetch
const data = await apiClient.getInvoices(
  { estatus, area, created_by, search },
  { Authorization: `Bearer ${token}` }
);
```

**OPCIÓN 2: Mantener axios (Sin cambios grandes)**
```javascript
import axios from 'axios';
import { useTour } from '../context/TourContext';

const InvoicesPage = () => {
  const { demoMode, demoData } = useTour();
  
  // Si estamos en demo, usar datos mock
  if (demoMode && demoData) {
    setInvoices(demoData.invoices.items);
    setLoading(false);
    return;
  }
  
  // Si no, hacer llamada a API
  const response = await axios.get('/api/invoices', ...);
};
```

## 📊 Datos Mock Disponibles

### Invoices
- **5 facturas** con estados: Capturada, En revisión, Programada, Pagada, Rechazada
- Asociadas a diferentes áreas
- Montos: 3,200 - 42,300
- Provedores reales: Industrial S.A., Servicios TI, Distribuidora, etc.

### Areas
- Administración
- Tecnología
- Operaciones
- Recursos Humanos
- Finanzas

### Users
- Usuarios por área (Usuario Área)
- Roberto Sánchez (Tesorero)
- Laura Gómez (Administrador)

### Stats
Se calculan automáticamente desde las facturas:
- Facturas pendientes / vencidas / pagadas
- Montos totales por estado

## ⚡ Performance

- **Carga en memoria**: Una sola vez al iniciar tour (100ms)
- **Latencia simulada**: 150-200ms (para que se sienta real)
- **Sin llamadas a API**: Tour es completamente offline-ready
- **Proveedor automaticamente**: En `startTour()` se precarga en paralelo

## 🔧 Agregar Más Datos Mock

1. Edita `/public/mockData/invoices.json`
2. Edita `/public/mockData/areas.json`
3. Edita `/public/mockData/users.json`
4. Los cambios son automáticos (sin recompilar)

## ❌ Restricciones en Demo Mode

En demo mode:
- ✅ Ver datos (GET)
- ✅ Filtrar y buscar
- ❌ No puedes crear (POST) - lanza error
- ❌ No puedes modificar (PUT) - lanza error
- ❌ No puedes borrar (DELETE) - lanza error

## 📝 Uso en Componentes

### DashboardPage
```javascript
// Precarga stats de demo automáticamente
if (demoMode) {
  setStats(demoData.stats);
  return;
}
```

### InvoicesPage
```javascript
// Si es para el tour, muestra 5 facturas mock
// Si es real, carga de la API
```

### UsersPage
```javascript
// Mock: 6 usuarios de demostración
// Real: Usuarios de la BD
```

## 🔄 Flujo Completo

```
Usuario clickea "?" en header
         ↓
Button llama useTour().startTour()
         ↓
TourProvider carga datos mock en paralelo
         ↓
Datos se guardan en demoData
         ↓
apiClient.setDemoMode(true, demoData)
         ↓
App.js renderiza componentes con datos mock
         ↓
Tour comienza → FLUIDO, SIN LATENCIA
         ↓
Usuario termina tour
         ↓
completeTour() → demoMode = false
         ↓
Componentes vuelven a usar API real
```

## 🐛 Debugging

Si algo no carga en demo mode:

```javascript
const { demoMode, demoData } = useTour();
console.log('Demo Mode:', demoMode); // true/false
console.log('Demo Data:', demoData); // {invoices, areas, users, stats}
```

En apiClient.js hay logs de qué modo se está usando.

---

**Resultado**: Tour rápido, fluido y sin esperas. ¡Perfecto para demostración! ✨
