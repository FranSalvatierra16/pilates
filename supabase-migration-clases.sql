-- Migración: Agregar columna clases_asistidas a la tabla alumnos
-- Ejecutar esto en el SQL Editor de Supabase

ALTER TABLE alumnos 
ADD COLUMN IF NOT EXISTS clases_asistidas INTEGER DEFAULT 0;

-- Actualizar registros existentes para que tengan 0 clases
UPDATE alumnos 
SET clases_asistidas = 0 
WHERE clases_asistidas IS NULL;

