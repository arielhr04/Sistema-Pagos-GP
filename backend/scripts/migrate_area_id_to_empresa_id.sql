-- SQL Server Migration: Rename area_id to empresa_id
-- Este script actualiza la columna en la tabla de usuarios

-- Verificar que la tabla existe y revisa columnas actuales
SELECT 'BEFORE RENAME:' as [Status];
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'tesoreriapp_gp_users' 
ORDER BY COLUMN_NAME;

-- Rename la columna
EXEC sp_RENAME 'tesoreriapp_gp_users.area_id', 'empresa_id', 'COLUMN';

-- Espera un segundo para que se propague el cambio
WAITFOR DELAY '00:00:01';

-- Verificar que se renombró correctamente
SELECT 'AFTER RENAME:' as [Status];
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'tesoreriapp_gp_users' 
ORDER BY COLUMN_NAME;

-- Si la foreign key también necesita ser recreada (si es necesario):
-- Este paso es opcional, hazlo solo si obtienes errores de FK
-- ALTER TABLE tesoreriapp_gp_users DROP CONSTRAINT [nombre_fk];
-- ALTER TABLE tesoreriapp_gp_users ADD CONSTRAINT FK_User_Area 
--     FOREIGN KEY (empresa_id) REFERENCES tesoreriapp_gp_empresas(id);
