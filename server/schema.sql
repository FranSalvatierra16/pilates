-- Esquema PostgreSQL para SAVIA Pilates (multi-sucursal)
-- Sucursales (cada una: usuario, contraseña, nombre del lugar, foto de perfil)
CREATE TABLE IF NOT EXISTS sucursales (
  id TEXT PRIMARY KEY,
  nombre_lugar TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL,
  foto_perfil TEXT,
  pago_mensual NUMERIC,
  fecha_vencimiento_cuenta DATE,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sucursales_usuario ON sucursales(usuario);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS pago_mensual NUMERIC;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS fecha_vencimiento_cuenta DATE;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT true;
-- Horarios configurables por sucursal (ej. Savia 7-12, Nes 9-13)
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS hora_inicio_manana TEXT DEFAULT '07:00';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS hora_fin_manana TEXT DEFAULT '12:00';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS hora_inicio_tarde TEXT DEFAULT '16:00';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS hora_fin_tarde TEXT DEFAULT '21:00';

-- Admin (una cuenta para gestionar todas las sucursales)
CREATE TABLE IF NOT EXISTS admin (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Actividades
CREATE TABLE IF NOT EXISTS actividades (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS clases_por_semana INTEGER;

-- Alumnos
CREATE TABLE IF NOT EXISTS alumnos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  fecha_vencimiento_cuota DATE,
  actividad_id TEXT REFERENCES actividades(id),
  clases_asistidas INTEGER DEFAULT 0,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS clases_para_recuperar INTEGER DEFAULT 0;

-- Pagos
CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS hora TEXT;

-- Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS hora TEXT;

-- Profesores
CREATE TABLE IF NOT EXISTS profesores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE profesores ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS profesor_id TEXT REFERENCES profesores(id);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS contabilizar_en_fecha DATE;

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
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS cupo INTEGER DEFAULT 6;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT false;

-- Asistencias
CREATE TABLE IF NOT EXISTS asistencias (
  id TEXT PRIMARY KEY,
  turno_id TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado TEXT CHECK (estado IN ('asistio', 'no_asistio')),
  semana TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registros desde link público
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
ALTER TABLE registros_link ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_registros_link_created_at ON registros_link(created_at DESC);

-- Índices
CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
CREATE INDEX IF NOT EXISTS idx_alumnos_sucursal ON alumnos(sucursal_id);
-- Permitir pagos sin alumno (aporte a caja, ingreso del dueño)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS sucursal_id TEXT REFERENCES sucursales(id) ON DELETE CASCADE;
ALTER TABLE pagos ALTER COLUMN alumno_id DROP NOT NULL;

-- Token para que el alumno acceda solo a sumarse/liberar cupo en clases (portal público)
ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS link_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alumnos_link_token ON alumnos(link_token) WHERE link_token IS NOT NULL;

-- Notificaciones: cuando un alumno se anota o libera cupo (panel del usuario)
CREATE TABLE IF NOT EXISTS notificaciones (
  id TEXT PRIMARY KEY,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('inscribio', 'liberar')),
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  turno_id TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_sucursal_created ON notificaciones(sucursal_id, created_at DESC);
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT FALSE;

-- Suscripciones para notificaciones push al celular (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_sucursal ON push_subscriptions(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_pagos_alumno_id ON pagos(alumno_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_sucursal_id ON pagos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_dia_hora ON turnos(dia_semana, hora);
CREATE INDEX IF NOT EXISTS idx_turnos_profesor_id ON turnos(profesor_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_semana ON asistencias(semana);

-- Cierres de caja: corte operativo por sucursal
CREATE TABLE IF NOT EXISTS cierres_caja (
  id TEXT PRIMARY KEY,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  fecha_cierre DATE NOT NULL,
  cerrado_en TIMESTAMP WITH TIME ZONE,
  monto_retirado NUMERIC NOT NULL DEFAULT 0,
  saldo_antes_retiro NUMERIC,
  saldo_despues_retiro NUMERIC,
  fecha_desde DATE,
  fecha_hasta DATE,
  ingresos_efectivo NUMERIC,
  ingresos_transferencia NUMERIC,
  gastos_efectivo NUMERIC,
  gastos_transferencia NUMERIC,
  total_ingresos NUMERIC,
  total_gastos NUMERIC,
  neto NUMERIC,
  movimientos_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cierres_caja_sucursal ON cierres_caja(sucursal_id, created_at DESC);

-- Recuperaciones: alumnos agregados temporalmente a una clase para recuperar; desaparecen al reiniciar semana
CREATE TABLE IF NOT EXISTS recuperaciones (
  id TEXT PRIMARY KEY,
  turno_id TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  semana TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE recuperaciones ADD COLUMN IF NOT EXISTS usa_credito BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_recuperaciones_semana ON recuperaciones(semana);

-- Inscripciones: alumno en turno desde qué semana (semanas anteriores no lo muestran)
CREATE TABLE IF NOT EXISTS inscripciones_turno (
  id TEXT PRIMARY KEY,
  turno_id TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  alumno_id TEXT NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  semana_desde TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inscripciones_turno_turno ON inscripciones_turno(turno_id);
