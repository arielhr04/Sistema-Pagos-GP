# 🚂 Guía de Deploy en Railway

## ⚠️ IMPORTANTE: Forzar Rebuild Completo

Railway está usando un cache viejo. Debes forzar un rebuild completo:

### Opción 1: Desde el Dashboard de Railway (RECOMENDADO)
1. Ve a tu proyecto en Railway
2. Ve a **Settings** → **General**
3. Busca **"Redeploy"** o **"Trigger Deploy"** 
4. O simplemente elimina el deployment actual y crea uno nuevo

### Opción 2: Desde CLI de Railway
```bash
railway up --detach
```

### Opción 3: Cambiar la configuración de Build
1. Ve a **Settings** → **Deploy**
2. En **Builder**, selecciona **Dockerfile** (no Nixpacks)
3. Guarda y haz redeploy

---

## 📁 Archivos Configurados

### ✅ railway.json (NUEVO)
```json
{
  "build": {
    "builder": "DOCKERFILE"  
  },
  "deploy": {
    "startCommand": "python -m backend"
  }
}
```
Este archivo **fuerza** a Railway a usar el Dockerfile.

### ✅ backend/__main__.py (NUEVO)
```python
import os
import uvicorn

port = int(os.environ.get("PORT", 8080))
uvicorn.run("backend.server:app", host="0.0.0.0", port=port)
```
Este archivo lee correctamente `PORT` como entero desde las variables de entorno.

### ✅ Dockerfile
```dockerfile
CMD ["python", "-m", "backend"]
```
Ejecuta directamente el módulo Python sin expansión de shell.

### ❌ Procfile (ELIMINADO)
El Procfile causaba conflictos con Nixpacks. Railway ahora usa **solo el Dockerfile**.

---

## 🔧 Solución al Error `'$PORT' is not a valid integer`

**Causa del error:**
Railway estaba ejecutando:
```bash
uvicorn backend.server:app --port $PORT  # ❌ $PORT como string literal
```

**Solución implementada:**
```bash
python -m backend  # ✅ Python lee PORT como int(os.environ.get("PORT"))
```

Railway inyecta automáticamente la variable `PORT` en el entorno. Python la lee como entero directamente.

---

## 🚀 Comandos Git para Deploy

```powershell
# Agregar cambios
git add railway.json backend/__main__.py Dockerfile
git add -u  # Esto detecta Procfile eliminado

# Commit
git commit -m "fix: Railway deployment - usar Dockerfile + Python __main__"

# Push
git push origin main
```

---

## ✅ Verificación Local

Antes de deployar, verifica localmente:

```powershell
# Test 1: Verificar que Python lee PORT
$ENV:PORT=8000
python -c "import os; print(f'PORT: {os.environ.get(\"PORT\")}')"

# Test 2: Ejecutar el servidor localmente
python -m backend

# Test 3: Verificar que responde
# En otro terminal:
curl http://localhost:8000
```

---

## 📊 Estructura Final

```
Grupo-Gran-Premio-main/
├── railway.json          ← FUERZA uso de Dockerfile
├── Dockerfile            ← CMD ["python", "-m", "backend"]
├── requirements.txt      ← Incluye uvicorn==0.25.0
├── backend/
│   ├── __init__.py
│   ├── __main__.py       ← PUNTO DE ENTRADA (lee PORT)
│   ├── server.py         ← Aplicación FastAPI
│   ├── models/
│   ├── routes/
│   └── ...
└── frontend/
```

---

## 🐛 Si Sigue Fallando

1. **Elimina el deployment completo** en Railway
2. **Crea un nuevo proyecto** desde cero
3. Conecta el repositorio nuevamente
4. Railway detectará automáticamente:
   - `railway.json` → Usará Dockerfile
   - `Dockerfile` → Build automático
   - Variable `PORT` → Inyectada automáticamente

---

## 📚 Referencias Oficiales

- [Railway Dockerfile Deploy](https://docs.railway.app/deploy/dockerfiles)
- [Railway Environment Variables](https://docs.railway.app/develop/variables)
- [Python PORT Configuration](https://docs.railway.app/guides/fastapi)

---

**Fecha:** Marzo 4, 2026  
**Status:** ✅ CONFIGURADO - Listo para deploy
