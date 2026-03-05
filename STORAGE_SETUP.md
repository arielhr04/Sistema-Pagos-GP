# 💾 Configuración de Almacenamiento de Archivos

## 📌 Problema Actual

Los archivos PDF (facturas y comprobantes de pago) se guardan en `backend/uploads/`, pero:

❌ **NO se suben a GitHub** (por privacidad y tamaño)  
❌ **Se pierden en cada redeploy de Railway** (filesystem efímero)

## ✅ Solución: Railway Volumes (Almacenamiento Persistente)

### Pasos para configurar en Railway:

#### 1. Crear un Volume

1. Ve a tu proyecto en Railway
2. Haz clic en tu servicio (backend)
3. Ve a la pestaña **"Settings"**
4. Busca la sección **"Volumes"**
5. Haz clic en **"+ New Volume"**

**Configuración del Volume:**
```
Volume Name: uploads-storage
Mount Path: /app/backend/uploads
```

#### 2. Verificar configuración

Una vez creado, verás:
```
✅ uploads-storage → /app/backend/uploads
```

Railway automáticamente montará esta carpeta como almacenamiento persistente.

#### 3. Redeploy

Después de crear el Volume:
1. Haz un nuevo deploy (o fuerza un redeploy)
2. Los archivos ahora persistirán entre deploys

---

## 📁 Estructura de Archivos

### Archivos de Factura
```
FACGP_{folio_fiscal}_{proveedor}.pdf
```
Ejemplo: `FACGP_ABC123456_AIZ_Digital.pdf`

### Comprobantes de Pago
```
PAGP_{folio_fiscal}_{proveedor}.pdf
```
Ejemplo: `PAGP_ABC123456_AIZ_Digital.pdf`

---

## 🔒 Seguridad en GitHub

El `.gitignore` está configurado para **NO** subir archivos de `backend/uploads/`:

```gitignore
# Backend uploads (archivos de usuarios - NO subir a GitHub)
backend/uploads/*
!backend/uploads/.gitkeep
```

Solo el archivo `.gitkeep` se incluye para mantener la carpeta en el repo.

---

## 🚀 Alternativas (Futuro)

Si necesitas más escalabilidad:

### Opción A: AWS S3
- Almacenamiento ilimitado
- Acceso desde múltiples instancias
- CDN integrado
- **Costo**: ~$0.023 por GB/mes

### Opción B: Azure Blob Storage
- Integración con Azure
- Redundancia geográfica
- **Costo**: Similar a S3

### Opción C: Cloudflare R2
- Sin costos de egreso (descargas gratis)
- Compatible con API S3
- **Costo**: $0.015 por GB/mes

---

## 📊 Capacidad del Volume

Railway Volumes:
- **Mínimo**: 1 GB (gratis en plan hobby)
- **Máximo**: 50 GB (plan pro)
- **Costo adicional**: $0.25 por GB/mes (después del límite gratuito)

### Estimación de uso:
- PDF promedio: 200 KB
- 1 GB = ~5,000 facturas con comprobantes
- 10 GB = ~50,000 facturas con comprobantes

---

## ✅ Checklist de Configuración

- [x] `.gitignore` actualizado para excluir `backend/uploads/*`
- [x] `.gitkeep` creado en `backend/uploads/`
- [ ] Volume creado en Railway (`uploads-storage`)
- [ ] Mount path configurado: `/app/backend/uploads`
- [ ] Redeploy realizado en Railway
- [ ] Prueba: subir una factura y verificar que persiste después de redeploy

---

## 🐛 Troubleshooting

**Problema**: Los archivos siguen desapareciendo después de redeploy

**Solución**:
1. Verifica que el Volume esté montado en `/app/backend/uploads` (no `/backend/uploads`)
2. Revisa los logs: `railway logs`
3. Confirma que la carpeta existe: Ejecuta `ls -la /app/backend/uploads` en Railway Shell

**Problema**: No puedo descargar archivos desde el frontend

**Solución**:
1. Verifica que el endpoint `/api/files/{filename}` funcione
2. Revisa permisos de lectura en el Volume
3. Checa logs del backend para errores de FileNotFoundError

---

**Fecha de configuración**: Marzo 5, 2026  
**Status**: ⚠️ Pendiente configurar Volume en Railway
