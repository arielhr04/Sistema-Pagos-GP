# 🔧 Corrección de Errores de Conexión SQL Server en Railway

## Problema Identificado

Error crítico en producción (Railway):
```
pyodbc.OperationalError: ('08S01', '[08S01] [Microsoft][ODBC Driver 17 for SQL Server]TCP Provider: Error code 0x68 (104)')
```

**Causa raíz**: Conexiones TCP interrumpidas por:
- Timeouts de red/firewall entre Railway y SQL Server
- SQL Server cerrando conexiones idle
- Pool de conexiones con configuración inadecuada para entornos cloud

---

## ✅ Mejoras Implementadas

### 1. **Pool de Conexiones Optimizado para Cloud**
**Archivo**: `backend/db/session.py`

**Cambios**:
- ✅ `pool_recycle=300` (5 min, antes 30 min) — recicla conexiones más agresivamente
- ✅ `pool_timeout=30` — timeout explícito al obtener conexión del pool
- ✅ `connect_args` mejorado con `connect_timeout`
- ✅ Event listeners para monitorear reconexiones

**Justificación**: En Railway/cloud, las conexiones pueden ser interrumpidas por proxies/firewalls. Reciclar cada 5 minutos previene conexiones "stale".

---

### 2. **Retry Logic Automático**
**Archivo**: `backend/db/session.py`

**Implementación**:
```python
- Max 3 reintentos automáticos
- Backoff exponencial (0.5s, 1s, 2s)
- Detecta específicamente errores 08S01 (Connection reset)
- Retorna 503 si falla después de reintentos
```

**Beneficio**: Los usuarios experimentan menos errores 500 por pérdidas temporales de red.

---

### 3. **Logging Mejorado**
**Archivo**: `backend/db/session.py`

**Correcciones**:
- ❌ **ANTES**: HTTPException (token expirado) se loggeaba como error de DB
- ✅ **AHORA**: Distingue entre errores de autenticación y errores reales de DB
- ✅ Logs específicos para conexiones perdidas vs errores operacionales

**Impacto**: Facilita diagnóstico en producción sin confusión.

---

### 4. **Health Check Mejorado**
**Archivo**: `backend/routes/system_routes.py`

**Nuevas funcionalidades**:
```
GET /api/health
- Verifica conexión SQL Server
- Retorna info del pool (size, checked_in, overflow)
- Status 503 si DB no disponible
```

**Uso en Railway**:
```bash
# Configurar Health Check en Railway:
PATH: /api/health
Expected Status: 200
```

---

### 5. **Endpoint de Reset de Pool** (🔧 Admin)
**Archivo**: `backend/routes/system_routes.py`

```
POST /api/db/pool/reset
```

**Uso**: Si el pool queda corrupto, permite resetear sin reiniciar la app.

```bash
curl -X POST https://tu-app.railway.app/api/db/pool/reset
```

---

## 📊 Monitoreo en Railway

### Health Check Automático
Configura en Railway Dashboard:
1. Settings → Health Checks
2. Path: `/api/health`
3. Port: (mismo que tu app)
4. Expected Status: `200`
5. Interval: 30s

### Logs a Monitorear
```bash
# Conexiones exitosas
🔌 [DB] Nueva conexión establecida

# Reconexiones después de error
⚠️ [DB] Pérdida de conexión (intento 1/3). Reintentando en 0.5s...

# Error persistente
❌ [DB] Error de conexión persistente después de 3 intentos
```

---

## 🚨 Próximos Pasos Recomendados

### Corto Plazo (Si el problema persiste)
1. **Verificar configuración SQL Server**:
   - ¿Timeout configurado en el servidor?
   - ¿Firewall bloqueando conexiones después de X minutos?
   - ¿Max connections suficientes?

2. **Monitorear métricas del pool**:
   ```bash
   # Llamar health check periódicamente
   watch -n 10 'curl https://tu-app.railway.app/api/health'
   ```

3. **Revisar variables de entorno Railway**:
   ```env
   DATABASE_URL=mssql+pyodbc://...
   # Asegurar que incluye todos los parámetros necesarios
   ```

### Mediano Plazo (Optimización)
1. **Considerar connection pooling externo**:
   - PgBouncer (si migras a PostgreSQL)
   - ProxySQL (si usas MySQL)
   - Azure SQL Database con connection pooling nativo

2. **Implementar Circuit Breaker**:
   - Si SQL Server cae, evitar saturar con reintentos
   - Ejemplo: biblioteca `pybreaker`

3. **Migrar a base de datos cloud-native**:
   - Azure SQL Database (mejor para Railway)
   - PostgreSQL en Railway (más estable para containers)

---

## 🧪 Testing Local

Para simular el problema en local:
```python
# Desconectar SQL Server mientras la app está corriendo
# El retry logic debería manejar la reconexión
```

Para verificar el retry:
```bash
# Ver logs en tiempo real
railway logs

# Buscar reintentos exitosos
railway logs | grep "Reintentando"
```

---

## 📞 Soporte

Si el problema persiste después de estos cambios:
1. Revisar logs de Railway: `railway logs --tail 100`
2. Verificar health check: `GET /api/health`
3. Revisar pool status en respuesta de health check
4. Si es necesario, resetear pool: `POST /api/db/pool/reset`

---

**Fecha de implementación**: 2026-05-18  
**Versión**: 1.0  
**Estado**: ✅ Implementado y listo para deploy
