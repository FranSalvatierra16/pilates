-- Migración: Agregar tabla de profesores y columnas título/profesor_id a turnos
-- Ejecutar esto en el SQL Editor de Supabase

-- Crear tabla de profesores si no existe
CREATE TABLE IF NOT EXISTS profesores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columnas a turnos si no existen
ALTER TABLE turnos 
ADD COLUMN IF NOT EXISTS titulo TEXT;

ALTER TABLE turnos 
ADD COLUMN IF NOT EXISTS profesor_id TEXT REFERENCES profesores(id);

-- Crear índice para profesor_id
CREATE INDEX IF NOT EXISTS idx_turnos_profesor_id ON turnos(profesor_id);

