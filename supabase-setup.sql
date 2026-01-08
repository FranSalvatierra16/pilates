-- Script SQL para crear las tablas en Supabase
-- Ejecutar esto en el SQL Editor de Supabase

-- Tabla de Actividades
CREATE TABLE IF NOT EXISTS actividades (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Alumnos
CREATE TABLE IF NOT EXISTS alumnos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  fecha_vencimiento_cuota DATE,
  actividad_id TEXT REFERENCES actividades(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Pagos
CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Turnos
CREATE TABLE IF NOT EXISTS turnos (
  id TEXT PRIMARY KEY,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 5),
  hora TEXT NOT NULL,
  alumno_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
CREATE INDEX IF NOT EXISTS idx_pagos_alumno_id ON pagos(alumno_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_dia_hora ON turnos(dia_semana, hora);

-- Habilitar Row Level Security (RLS) - opcional, para producción
-- ALTER TABLE alumnos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones (solo para desarrollo/pruebas)
-- CREATE POLICY "Allow all operations" ON alumnos FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all operations" ON actividades FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all operations" ON pagos FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all operations" ON gastos FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all operations" ON turnos FOR ALL USING (true) WITH CHECK (true);

