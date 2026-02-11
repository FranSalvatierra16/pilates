-- Esquema PostgreSQL para SAVIA Pilates (Railway u otro)
-- Se ejecuta automáticamente al iniciar el servidor si las tablas no existen

-- Actividades
CREATE TABLE IF NOT EXISTS actividades (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alumnos
CREATE TABLE IF NOT EXISTS alumnos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  fecha_vencimiento_cuota DATE,
  actividad_id TEXT REFERENCES actividades(id),
  clases_asistidas INTEGER DEFAULT 0,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permitir agregar columna en bases existentes
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Pagos
CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profesores
CREATE TABLE IF NOT EXISTS profesores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turnos
CREATE TABLE IF NOT EXISTS turnos (
  id TEXT PRIMARY KEY,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  hora TEXT NOT NULL,
  titulo TEXT,
  profesor_id TEXT REFERENCES profesores(id),
  alumno_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asistencias
CREATE TABLE IF NOT EXISTS asistencias (
  id TEXT PRIMARY KEY,
  turno_id TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado TEXT CHECK (estado IN ('asistio', 'no_asistio')),
  semana TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usuarios (login)
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);

-- Registros desde link público (IG, etc.): se cargan acá y después se agregan como alumnos
CREATE TABLE IF NOT EXISTS registros_link (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  actividad_id TEXT REFERENCES actividades(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registros_link_created_at ON registros_link(created_at DESC);

-- Índices
CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
CREATE INDEX IF NOT EXISTS idx_pagos_alumno_id ON pagos(alumno_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_dia_hora ON turnos(dia_semana, hora);
CREATE INDEX IF NOT EXISTS idx_turnos_profesor_id ON turnos(profesor_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_semana ON asistencias(semana);
