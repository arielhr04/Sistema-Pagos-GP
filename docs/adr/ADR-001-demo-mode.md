# ADR-001: Sistema de Demo Mode para Tours Interactivos

**Fecha**: Marzo 2026  
**Estado**: Aceptado  
**Contexto**: Necesidad de hacer tours fluidos sin latencia de API

---

## Problema

Cuando se inicia un tour interactivo (react-joyride) para nuevos usuarios, cada navegación a una página diferente requiere:
1. Instanciar componente React
2. Hacer requests HTTP a la API
3. Esperar respuesta de BD (típicamente 200-500ms)
4. Renderizar componente
5. Continuar el tour

Esto causa **pauses notables** en el tour, rompiendo la experiencia de aprendizaje fluida.

---

## Decisión

**Implementar un "Demo Mode" session-local que:**

1. **Precarga datos mock en paralelo** al iniciar el tour
2. **Cambia automáticamente las fuentes de datos** cuando `demoMode=true`
3. **Simula latencia realista** (~150ms) para realismo
4. **Bloquea operaciones destructivas** (POST/PUT/DELETE)
5. **No impacta la base de datos real** (session-local)
6. **No afecta a usuarios normales** (flag por defecto false)

---

## Contexto Técnico

### Antes (Sin Demo Mode)

```javascript
// KanbanPage.js
const fetchColumn = async (status) => {
  // Espera real a API: 300-500ms
  const response = await axios.get('/api/invoices?estatus=' + status);
  setColumnData(response.data);
};

// Tour pausa → usuario debe navegar manualmente → experiencia quebrada
```

### Después (Con Demo Mode)

```javascript
// KanbanPage.js
const fetchColumn = async (status) => {
  if (demoMode && demoData?.invoices) {
    // Datos listos al instante (~150ms simulado)
    const filtered = demoData.invoices.filter(inv => inv.estatus === status);
    setColumnData(filtered);
    return;
  }
  // Flujo normal para usuarios reales
  const response = await axios.get('/api/invoices?estatus=' + status);
  setColumnData(response.data);
};

// Tour fluido → Joyride continúa automáticamente → buena UX
```

---

## Arquitectura

### 1. Mock Data (JSON Estático)

```
frontend/public/mockData/
├── invoices.json      # 5 facturas con varios estados
├── areas.json         # 5 áreas organizacionales
└── users.json         # 6 usuarios con diferentes roles
```

**Ventajas:**
- Cero dependencias de BD
- Carga al instante
- Fácil de versionar (git)

### 2. Mock Data Service

```typescript
// mockDataService.js
export default {
  getMockInvoices() → {data: {items: [...]}, ...}
  getMockAreas() → {data: {items: [...]},...}
  getMockUsers() → {data: {items: [...]},...}
  getMockDashboardStats() → {data: {...}}
  getMockAuditLogs() → {data: {items: [...]}}
  getMockLoginLogs() → {data: {items: [...]}}
};
```

**Ventajas:**
- Interfaz consistente (como si fuera API)
- Fácil de mantener en un lugar
- Genera logs automáticamente

### 3. Tour Context

```javascript
// TourContext.js
const startTour = async () => {
  // 1. Cargar datos PRIMERO
  const [invoices, areas, users, stats, auditLogs, loginLogs] = 
    await Promise.all([
      mockDataService.getMockInvoices(),
      mockDataService.getMockAreas(),
      // ... resto
    ]);
  
  // 2. Guardar en estado
  setDemoData({ invoices, areas, users, stats, auditLogs, loginLogs });
  
  // 3. ENTONCES activar demo mode (datos listos)
  setDemoModeState(true);
};
```

**Ventajas:**
- Datos listos antes de cambiar flag
- Orden correcto de operaciones
- Sin race conditions

### 4. Integración en Componentes

```javascript
// Cada página (DashboardPage, KanbanPage, etc)
const { demoMode, demoData } = useTour();

const fetchColumn = async (status) => {
  // 1. Verificar demo mode PRIMERO
  if (demoMode && demoData?.invoices) {
    // Usar mock (latencia simulada)
    await new Promise(r => setTimeout(r, 150));
    setData(demoData.invoices.filter(inv => inv.estatus === status));
    return;
  }
  
  // 2. Si no demo, usar API normal
  const res = await axios.get('/api/invoices?estatus=' + status);
  setData(res.data.items);
};

// Bloquear operaciones peligrosas
const handleDelete = () => {
  if (demoMode) {
    toast.error('No puedes eliminar en tour');
    return;
  }
  // Eliminar real
};
```

**Ventajas:**
- Cambio en un solo lugar
- Operaciones bloqueadas automáticamente
- Tests fáciles (mock vs real)

---

## Alternativas Consideradas

### 1. API Sandbox
**Idea:** Crear una segunda base de datos "demo" con datos de prueba

**Rechazo:**
- Mantener 2 BDs sincronizadas
- Costo de infraestructura duplicado
- Latencia real (sigue siendo 300ms+)
- Afecta estadísticas de la BD real

### 2. Datos Hardcoded en Componentes
**Idea:** Incluir datos de prueba en cada componente

**Rechazo:**
- Espagueti code
- Difícil mantener consistencia entre páginas
- No se parece a interfaz real
- Cambios requieren editar múltiples archivos

### 3. JSON + Context (ELEGIDO)
**Razones:**
- Cero impacto en BD
- Datos en un lugar centralizado
- Interfaz consistente con API
- Fácil de mantener
- Performance óptimo (~150ms)

---

## Consecuencias

### Ventajas

1. **UX mejorada**
   - Tours fluidos sin pausas
   - Usuarios nuevos aprenden más rápido

2. **Cero impacto en BD**
   - No replica datos en producción
   - No afecta otros usuarios
   - Session-local

3. **Seguridad**
   - Datos mock claramente separados
   - Operaciones destructivas bloqueadas
   - Sin acceso real a facturas

4. **Mantenibilidad**
   - JSON versionado en git
   - Fácil iterar en datos de prueba
   - Centralizado en `mockDataService.js`

### Tradeoffs

1. **Mantener JSON sincronizado**
   - Si cambia estructura de factura, actualizar `invoices.json`
   - Solución: Script automático (futuro)

2. **Datos estáticos**
   - Los tours siempre ven datos iguales
   - Solución: Randomizar datos con seed (futuro)

3. **Latencia simulada**
   - 150ms de delay artificial
   - Intentional: para aprender con realismo

---

## Implementación

### Secuencia de Eventos

```
Usuario hace clic "?" en header
    ↓
AppTour.startTour()
    ↓
TourContext.startTour()
    ↓
Promise.all([getMockInvoices(), getMockAreas(), ...])
    ↓ (todos cargan en paralelo)
setDemoData({...})  ← Datos listos
    ↓
setDemoModeState(true)  ← Ahora sí activar
    ↓
UI comienza tour con demoMode=true
    ↓
KanbanPage.fetchColumn()
    if (demoMode && demoData?.invoices) ← VERDADERO
        return mock data
    ↓
Kanban renderiza → Joyride encuentra elemento
    ↓
Tour continúa sin pausa
```

### Páginas Integradas

- DashboardPage
- InvoicesPage  
- KanbanPage
- UsersPage
- AreasPage
- AuditPage

---

## Métricas de Éxito

- Tours completables start-to-finish sin interrupciones
- Cero errores de "elemento no encontrado" en Joyride
- Datos mock precargados < 500ms
- Frontend normal sin cambios cuando `demoMode=false`
- Usuario normal no ve diferencia

---

## Trabajo Futuro

1. **Randomizar datos** con seed para variety
2. **Script de generación** automática desde BD real
3. **Versioning de mock data** en git
4. **Tests E2E** con datos mock
5. **Analytics** - rastrear qué usuarios completan tours

---

## Referencias

- [Joyride Docs](https://docs.react-joyride.com/)
- [Mock Data Best Practices](https://martinfowler.com/articles/testing-strategies.html)
- Context API React: https://react.dev/reference/react/useContext

---

**Aprobado por**: Equipo de Desarrollo  
**Revisado**: Marzo 2026
