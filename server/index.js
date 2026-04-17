import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'savia-pilates-secret-cambiar-en-produccion';

// Para notificaciones push al celular: generar claves con `npx web-push generate-vapid-keys`
// y configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Railway (o .env).
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:app@savia.local', VAPID_PUBLIC, VAPID_PRIVATE);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIAS_SEMANA_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
console.log('PORT desde env:', process.env.PORT, '-> escuchando en', PORT);

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Evitar que el navegador cachee respuestas de la API (mismo dato en todos los dispositivos)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// Asegurar que las tablas existan antes de responder (evita "a veces vacío" en distintos dispositivos)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  if (!getDatabaseUrl()) return next();
  try {
    await ensureSchemaReady();
    next();
  } catch (err) {
    console.error('Schema no listo:', err.message);
    res.status(503).json({ error: 'Base de datos en preparación. Reintentá en unos segundos.' });
  }
});

// Auth: exigir JWT en todas las rutas excepto login, health, manifest PWA, registro público y portal alumno
const authSkip = ['/health', '/auth/login', '/manifest.webmanifest'];
const isAuthSkip = (path) => authSkip.some((p) => path === p || path.startsWith(p + '?'));
app.use('/api', (req, res, next) => {
  if (isAuthSkip(req.path)) return next();
  if (req.path.startsWith('/public/')) return next();
  if (req.path.startsWith('/alumno-portal')) return next(); // Portal alumno: solo sumarse/liberar cupo
  if (req.path === '/registro-link' && req.method === 'POST' && !req.path.includes('/agregar')) return next();
  if (req.path === '/actividades' && req.method === 'GET' && !req.headers.authorization) return next();
  authMiddleware(req, res, () => {
    if (req.path.startsWith('/admin')) return requireAdmin(req, res, next);
    requireSucursal(req, res, next);
  });
});

let pool = null;
let schemaReady = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING
  );
}

async function getPool() {
  if (pool) return pool;
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.warn('Ninguna variable de base de datos definida (DATABASE_URL, DATABASE_PUBLIC_URL, POSTGRES_URL). Revisá Railway → Variables.');
    return null;
  }
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

function ensureSchemaReady() {
  if (!schemaReady) schemaReady = initSchema();
  return schemaReady;
}

async function seedAdminAndSucursal(db) {
  const adminUser = (process.env.ADMIN_USER || 'adminF').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '2401';
  const { rows: adminRows } = await db.query('SELECT id FROM admin WHERE usuario = $1', [adminUser]);
  if (adminRows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await db.query('INSERT INTO admin (id, usuario, clave_hash) VALUES ($1, $2, $3)', [crypto.randomUUID(), adminUser, hash]);
    console.log('Cuenta admin creada (usuario: ' + adminUser + ').');
  } else if (process.env.ADMIN_PASSWORD !== undefined && process.env.ADMIN_PASSWORD !== '') {
    const hash = await bcrypt.hash(adminPassword, 10);
    await db.query('UPDATE admin SET clave_hash = $1 WHERE usuario = $2', [hash, adminUser]);
    console.log('Contraseña admin actualizada (usuario: ' + adminUser + ').');
  }
  const { rows: sucRows } = await db.query('SELECT id FROM sucursales WHERE usuario = $1', ['Savia']);
  let saviaId = sucRows.length > 0 ? sucRows[0].id : null;
  if (sucRows.length === 0) {
    saviaId = crypto.randomUUID();
    const hash = await bcrypt.hash('2286', 10);
    await db.query(
      'INSERT INTO sucursales (id, nombre_lugar, usuario, clave_hash) VALUES ($1, $2, $3, $4)',
      [saviaId, 'Savia', 'Savia', hash]
    );
    console.log('Sucursal Savia creada (usuario: Savia, clave: 2286).');
  }
  if (saviaId) {
    for (const table of ['alumnos', 'actividades', 'gastos', 'profesores', 'turnos', 'registros_link']) {
      try {
        const r = await db.query(`UPDATE ${table} SET sucursal_id = $1 WHERE sucursal_id IS NULL`, [saviaId]);
        if (r.rowCount > 0) console.log(`Migrados ${r.rowCount} registros de ${table} a Savia.`);
      } catch (e) { /* columna puede no existir aún */ }
    }
  }
}

async function initSchema() {
  const db = await getPool();
  if (!db) return;
  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    await db.query(schema);
    await seedAdminAndSucursal(db);
    console.log('Esquema de base de datos listo.');
  } catch (err) {
    console.error('Error al inicializar esquema:', err.message);
    throw err;
  }
}

function normalizarHora(hora) {
  if (!hora || !String(hora).trim()) return '12:00';
  const m = String(hora).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '12:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatDateOnly(value) {
  if (!value) return '';
  return value?.toISOString?.()?.slice(0, 10) ?? String(value).slice(0, 10);
}

const ARGENTINA_UTC_OFFSET_HOURS = 3;

function combinarFechaHoraISO(fecha, hora) {
  const fd = String(fecha).slice(0, 10);
  const hhmm = normalizarHora(hora);
  return new Date(`${fd}T${hhmm}:00-03:00`).toISOString();
}

function instanteDesdeFechaHora(fecha, hora) {
  const fd = String(fecha).slice(0, 10);
  const hhmm = normalizarHora(hora);
  return new Date(`${fd}T${hhmm}:00-03:00`).getTime();
}

function fechaLocalYMD(date) {
  const shifted = new Date(new Date(date).getTime() - ARGENTINA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function instanteMovimientoParaPeriodoCaja(mov) {
  const base = instanteDesdeFechaHora(mov.fecha, mov.hora);
  if (normalizarHora(mov.hora) !== '12:00') return base;
  const created = new Date(mov.createdAt);
  if (!Number.isFinite(created.getTime())) return base;
  if (String(mov.fecha).slice(0, 10) !== fechaLocalYMD(created)) return base;
  return Math.max(base, created.getTime());
}

function instanteCierre(cierre) {
  if (cierre.cerradoEn) return new Date(cierre.cerradoEn).getTime();
  return instanteDesdeFechaHora(cierre.fechaCierre, '12:00');
}

function mapPagoRow(r) {
  return {
    id: r.id,
    alumnoId: r.alumno_id ?? null,
    monto: Number(r.monto),
    metodoPago: r.metodo_pago,
    fecha: formatDateOnly(r.fecha),
    hora: r.hora || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    descripcion: r.descripcion ?? undefined,
  };
}

function mapGastoRow(r) {
  return {
    id: r.id,
    descripcion: r.descripcion,
    monto: Number(r.monto),
    metodoPago: r.metodo_pago,
    fecha: formatDateOnly(r.fecha),
    hora: r.hora || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    ...(r.profesor_id ? { profesorId: r.profesor_id } : {}),
    ...(r.contabilizar_en_fecha ? { contabilizarEnFecha: formatDateOnly(r.contabilizar_en_fecha) } : {}),
  };
}

function mapCierreCajaRow(r) {
  return {
    id: r.id,
    descripcion: r.descripcion,
    fechaCierre: formatDateOnly(r.fecha_cierre),
    cerradoEn: r.cerrado_en?.toISOString?.() ?? r.cerrado_en ?? undefined,
    montoRetirado: Number(r.monto_retirado ?? 0),
    saldoAntesRetiro: r.saldo_antes_retiro != null ? Number(r.saldo_antes_retiro) : undefined,
    saldoDespuesRetiro: r.saldo_despues_retiro != null ? Number(r.saldo_despues_retiro) : undefined,
    fechaDesde: r.fecha_desde ? formatDateOnly(r.fecha_desde) : undefined,
    fechaHasta: r.fecha_hasta ? formatDateOnly(r.fecha_hasta) : undefined,
    ingresosEfectivo: r.ingresos_efectivo != null ? Number(r.ingresos_efectivo) : undefined,
    ingresosTransferencia: r.ingresos_transferencia != null ? Number(r.ingresos_transferencia) : undefined,
    gastosEfectivo: r.gastos_efectivo != null ? Number(r.gastos_efectivo) : undefined,
    gastosTransferencia: r.gastos_transferencia != null ? Number(r.gastos_transferencia) : undefined,
    totalIngresos: r.total_ingresos != null ? Number(r.total_ingresos) : undefined,
    totalGastos: r.total_gastos != null ? Number(r.total_gastos) : undefined,
    neto: r.neto != null ? Number(r.neto) : undefined,
    movimientosCount: r.movimientos_count != null ? Number(r.movimientos_count) : undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

function buildCierreCajaServer({ descripcion, fechaCierre, horaCierre, montoRetirado, pagos, gastos, cierresExistentes }) {
  const cerradoEn = combinarFechaHoraISO(fechaCierre, horaCierre);
  const cerradoMs = new Date(cerradoEn).getTime();

  const totalIngresosHistorico = pagos.reduce((s, p) => s + p.monto, 0);
  const totalGastosHistorico = gastos.reduce((s, g) => s + g.monto, 0);
  const totalRetirosPrevios = cierresExistentes.reduce((s, c) => s + (c.montoRetirado ?? 0), 0);
  const saldoAntesRetiro = totalIngresosHistorico - totalGastosHistorico - totalRetirosPrevios;
  const saldoDespuesRetiro = saldoAntesRetiro - montoRetirado;

  const ultimoCierre = [...cierresExistentes].sort((a, b) => instanteCierre(b) - instanteCierre(a))[0] || null;
  const prevInstant = ultimoCierre ? instanteCierre(ultimoCierre) : null;

  const pagosSesion = pagos.filter((p) => {
    const t = instanteMovimientoParaPeriodoCaja(p);
    if (prevInstant != null && t <= prevInstant) return false;
    return t <= cerradoMs;
  });
  const gastosSesion = gastos.filter((g) => {
    if (g.profesorId) return false;
    const t = instanteMovimientoParaPeriodoCaja(g);
    if (prevInstant != null && t <= prevInstant) return false;
    return t <= cerradoMs;
  });

  let ingresosEfectivo = 0;
  let ingresosTransferencia = 0;
  let gastosEfectivo = 0;
  let gastosTransferencia = 0;

  for (const pago of pagosSesion) {
    if (pago.metodoPago === 'efectivo') ingresosEfectivo += pago.monto;
    else ingresosTransferencia += pago.monto;
  }
  for (const gasto of gastosSesion) {
    if (gasto.metodoPago === 'efectivo') gastosEfectivo += gasto.monto;
    else gastosTransferencia += gasto.monto;
  }

  const totalIngresos = ingresosEfectivo + ingresosTransferencia;
  const totalGastos = gastosEfectivo + gastosTransferencia;

  return {
    id: crypto.randomUUID(),
    descripcion: descripcion.trim(),
    fechaCierre,
    cerradoEn,
    montoRetirado,
    saldoAntesRetiro,
    saldoDespuesRetiro,
    fechaDesde: fechaCierre,
    fechaHasta: fechaCierre,
    ingresosEfectivo,
    ingresosTransferencia,
    gastosEfectivo,
    gastosTransferencia,
    totalIngresos,
    totalGastos,
    neto: totalIngresos - totalGastos,
    movimientosCount: pagosSesion.length + gastosSesion.length,
    createdAt: new Date().toISOString(),
  };
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

function requireSucursal(req, res, next) {
  if (req.user?.role !== 'sucursal' || !req.user?.sucursalId) return res.status(403).json({ error: 'Acceso de sucursal requerido' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso admin requerido' });
  next();
}

// --- Alumnos (por sucursal) ---
// "clases este mes" = cantidad de asistencias con estado 'asistio' en el mes actual (desde el calendario)
app.get('/api/alumnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const includeInactive = ['1', 'true', 'yes'].includes(String(req.query.includeInactive || '').toLowerCase());
    const { rows } = await db.query(
      `SELECT a.*,
        COALESCE((
          SELECT COUNT(*)::int FROM (
            SELECT 1 FROM asistencias asi
            JOIN turnos t ON asi.turno_id = t.id AND t.sucursal_id = a.sucursal_id
            WHERE asi.alumno_id = a.id AND asi.estado = 'asistio'
              AND asi.created_at >= date_trunc('month', CURRENT_DATE)
              AND asi.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'
            GROUP BY asi.turno_id, asi.semana
          ) u
        ), 0) AS clases_este_mes
       FROM alumnos a
       WHERE a.sucursal_id = $1
         AND ($2::boolean OR a.activo IS DISTINCT FROM false)
       ORDER BY a.created_at DESC`,
      [sid, includeInactive]
    );
    const data = rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      apellido: r.apellido,
      dni: r.dni,
      telefono: r.telefono,
      email: r.email,
      fechaVencimientoCuota: r.fecha_vencimiento_cuota ? r.fecha_vencimiento_cuota.toISOString().slice(0, 10) : '',
      actividadId: r.actividad_id,
      clasesAsistidas: r.clases_este_mes ?? 0,
      clasesParaRecuperar: Number(r.clases_para_recuperar ?? 0),
      descripcion: r.descripcion ?? '',
      linkToken: r.link_token ?? '',
      activo: r.activo !== false,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    }));
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alumnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const b = req.body;
    await db.query(
      `INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, clases_para_recuperar, descripcion, activo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        b.id,
        sid,
        b.nombre,
        b.apellido,
        b.dni,
        b.telefono,
        b.email,
        b.fechaVencimientoCuota || null,
        b.actividadId || null,
        b.clasesAsistidas ?? 0,
        b.clasesParaRecuperar ?? 0,
        b.descripcion ?? null,
        b.activo !== false,
        b.createdAt || new Date().toISOString(),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505' && (e.constraint === 'alumnos_dni_key' || e.constraint === 'alumnos_sucursal_id_dni_key')) {
      return res.status(409).json({ error: 'Ya existe un alumno con este DNI. Revisá la lista o usá otro DNI.' });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/alumnos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.nombre !== undefined) { updates.push(`nombre = $${i++}`); values.push(b.nombre); }
    if (b.apellido !== undefined) { updates.push(`apellido = $${i++}`); values.push(b.apellido); }
    if (b.dni !== undefined) { updates.push(`dni = $${i++}`); values.push(b.dni); }
    if (b.telefono !== undefined) { updates.push(`telefono = $${i++}`); values.push(b.telefono); }
    if (b.email !== undefined) { updates.push(`email = $${i++}`); values.push(b.email); }
    if (b.fechaVencimientoCuota !== undefined) { updates.push(`fecha_vencimiento_cuota = $${i++}`); values.push(b.fechaVencimientoCuota || null); }
    if (b.actividadId !== undefined) { updates.push(`actividad_id = $${i++}`); values.push(b.actividadId || null); }
    if (b.clasesAsistidas !== undefined) { updates.push(`clases_asistidas = $${i++}`); values.push(b.clasesAsistidas); }
    if (b.clasesParaRecuperar !== undefined) { updates.push(`clases_para_recuperar = $${i++}`); values.push(Math.max(0, Number(b.clasesParaRecuperar) || 0)); }
    if (b.descripcion !== undefined) { updates.push(`descripcion = $${i++}`); values.push(b.descripcion || null); }
    if (b.linkToken !== undefined) { updates.push(`link_token = $${i++}`); values.push(b.linkToken || null); }
    if (b.activo !== undefined) { updates.push(`activo = $${i++}`); values.push(!!b.activo); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE alumnos SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/alumnos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('UPDATE alumnos SET activo = false WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Historial de asistencias de un alumno (solo las marcadas como "asistió")
app.get('/api/alumnos/:id/asistencias', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const alumnoId = req.params.id;
    const { rows: alumnoRows } = await db.query('SELECT id FROM alumnos WHERE id = $1 AND sucursal_id = $2', [alumnoId, sid]);
    if (alumnoRows.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });
    const { rows } = await db.query(
      `SELECT asi.id, asi.turno_id, asi.semana, asi.estado, asi.created_at,
        t.dia_semana, t.hora, t.titulo
       FROM asistencias asi
       JOIN turnos t ON asi.turno_id = t.id AND t.sucursal_id = $1
       WHERE asi.alumno_id = $2 AND asi.estado IN ('asistio', 'no_asistio')
       ORDER BY asi.created_at DESC
       LIMIT 200`,
      [sid, alumnoId]
    );
    res.json(rows.map((r) => {
      const fecha = getFechaFromSemanaYDia(r.semana, r.dia_semana);
      return {
        id: r.id,
        turnoId: r.turno_id,
        semana: r.semana,
        diaSemana: r.dia_semana,
        hora: r.hora,
        titulo: r.titulo || 'Clase',
        fecha,
        estado: r.estado,
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      };
    }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alumnos/findByDni', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rows } = await db.query(
      `SELECT a.*,
        COALESCE((
          SELECT COUNT(*)::int FROM (
            SELECT 1 FROM asistencias asi
            JOIN turnos t ON asi.turno_id = t.id AND t.sucursal_id = a.sucursal_id
            WHERE asi.alumno_id = a.id AND asi.estado = 'asistio'
              AND asi.created_at >= date_trunc('month', CURRENT_DATE)
              AND asi.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'
            GROUP BY asi.turno_id, asi.semana
          ) u
        ), 0) AS clases_este_mes
       FROM alumnos a WHERE a.dni = $1 AND a.sucursal_id = $2 AND a.activo IS DISTINCT FROM false`,
      [req.query.dni, sid]
    );
    if (rows.length === 0) return res.json(null);
    const r = rows[0];
    res.json({
      id: r.id,
      nombre: r.nombre,
      apellido: r.apellido,
      dni: r.dni,
      telefono: r.telefono,
      email: r.email,
      fechaVencimientoCuota: r.fecha_vencimiento_cuota ? r.fecha_vencimiento_cuota.toISOString().slice(0, 10) : '',
      actividadId: r.actividad_id,
      clasesAsistidas: r.clases_este_mes ?? 0,
      descripcion: r.descripcion ?? '',
      activo: r.activo !== false,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Registros por link público (formulario IG, sin login) ---
app.post('/api/registro-link', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const id = crypto.randomUUID();
    const sucursalId = req.user?.sucursalId || b.sucursalId || null;
    await db.query(
      `INSERT INTO registros_link (id, sucursal_id, nombre, apellido, dni, telefono, email, actividad_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        sucursalId,
        (b.nombre || '').trim(),
        (b.apellido || '').trim(),
        (b.dni || '').trim(),
        (b.telefono || '').trim(),
        (b.email || '').trim(),
        b.actividadId || null,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/registro-link', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM registros_link WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]);
    res.json(rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      apellido: r.apellido,
      dni: r.dni,
      telefono: r.telefono,
      email: r.email,
      actividadId: r.actividad_id ?? '',
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/registro-link/:id/agregar', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM registros_link WHERE id = $1 AND sucursal_id = $2', [id, req.user.sucursalId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    const r = rows[0];
    const alumnoId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO alumnos (id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 0, $8)`,
      [alumnoId, r.nombre, r.apellido, r.dni, r.telefono, r.email, r.actividad_id, now]
    );
    await db.query('DELETE FROM registros_link WHERE id = $1', [id]);
    res.json({ ok: true, alumnoId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/registro-link/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM registros_link WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Actividades (por sucursal; GET puede ser público con ?sucursalId= para el formulario de registro) ---
app.get('/api/actividades', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId || req.query.sucursalId || null;
    if (!sid) return res.json([]);
    const { rows } = await db.query('SELECT * FROM actividades WHERE sucursal_id = $1 ORDER BY created_at DESC', [sid]);
    res.json(rows.map((r) => ({ id: r.id, nombre: r.nombre, precio: Number(r.precio), clasesPorSemana: r.clases_por_semana == null ? null : Number(r.clases_por_semana), createdAt: r.created_at?.toISOString?.() ?? r.created_at })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/actividades/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM actividades WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    if (rows.length === 0) return res.status(404).json(null);
    const r = rows[0];
    res.json({ id: r.id, nombre: r.nombre, precio: Number(r.precio), clasesPorSemana: r.clases_por_semana == null ? null : Number(r.clases_por_semana), createdAt: r.created_at?.toISOString?.() ?? r.created_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/actividades', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(403).json({ error: 'Debés iniciar sesión como sucursal para crear actividades' });
    const b = req.body;
    const id = b.id || crypto.randomUUID();
    await db.query(
      'INSERT INTO actividades (id, sucursal_id, nombre, precio, clases_por_semana, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, sid, (b.nombre || '').trim(), Number(b.precio) || 0, b.clasesPorSemana == null || b.clasesPorSemana === '' ? null : Math.max(1, Number(b.clasesPorSemana) || 1), b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/actividades/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.nombre !== undefined) { updates.push(`nombre = $${i++}`); values.push(b.nombre); }
    if (b.precio !== undefined) { updates.push(`precio = $${i++}`); values.push(b.precio); }
    if (b.clasesPorSemana !== undefined) { updates.push(`clases_por_semana = $${i++}`); values.push(b.clasesPorSemana == null || b.clasesPorSemana === '' ? null : Math.max(1, Number(b.clasesPorSemana) || 1)); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE actividades SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/actividades/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM actividades WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Pagos ---
app.get('/api/pagos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      `SELECT p.* FROM pagos p
       LEFT JOIN alumnos a ON p.alumno_id = a.id
       WHERE a.sucursal_id = $1 OR (p.alumno_id IS NULL AND p.sucursal_id = $1)
       ORDER BY p.created_at DESC`,
      [req.user.sucursalId]
    );
    res.json(rows.map(mapPagoRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pagos/by-alumno/:alumnoId', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      'SELECT p.* FROM pagos p JOIN alumnos a ON p.alumno_id = a.id WHERE p.alumno_id = $1 AND a.sucursal_id = $2 ORDER BY p.created_at DESC',
      [req.params.alumnoId, req.user.sucursalId]
    );
    res.json(rows.map(mapPagoRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pagos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const sucursalId = b.alumnoId ? null : req.user.sucursalId;
    await db.query(
      'INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, created_at, descripcion, sucursal_id, hora) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [b.id, b.alumnoId || null, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString(), b.descripcion || null, sucursalId, b.hora || null]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pagos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { id } = req.params;
    const { rowCount } = await db.query(
      `DELETE FROM pagos WHERE id = $1 AND (
        alumno_id IN (SELECT id FROM alumnos WHERE sucursal_id = $2) OR
        (alumno_id IS NULL AND sucursal_id = $2)
      )`,
      [id, req.user.sucursalId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Pago no encontrado' });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Gastos ---
app.get('/api/gastos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM gastos WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]);
    res.json(rows.map(mapGastoRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/gastos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    await db.query(
      'INSERT INTO gastos (id, sucursal_id, descripcion, monto, metodo_pago, fecha, created_at, hora, profesor_id, contabilizar_en_fecha) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [b.id, req.user.sucursalId, b.descripcion, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString(), b.hora || null, b.profesorId || null, b.contabilizarEnFecha || null]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/gastos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.descripcion !== undefined) { updates.push(`descripcion = $${i++}`); values.push(b.descripcion); }
    if (b.monto !== undefined) { updates.push(`monto = $${i++}`); values.push(b.monto); }
    if (b.metodoPago !== undefined) { updates.push(`metodo_pago = $${i++}`); values.push(b.metodoPago); }
    if (b.fecha !== undefined) { updates.push(`fecha = $${i++}`); values.push(b.fecha); }
    if (b.hora !== undefined) { updates.push(`hora = $${i++}`); values.push(b.hora || null); }
    if (b.profesorId !== undefined) { updates.push(`profesor_id = $${i++}`); values.push(b.profesorId || null); }
    if (b.contabilizarEnFecha !== undefined) { updates.push(`contabilizar_en_fecha = $${i++}`); values.push(b.contabilizarEnFecha || null); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE gastos SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/gastos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM gastos WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Cierres de caja ---
app.get('/api/cierres-caja', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      `SELECT *
         FROM cierres_caja
        WHERE sucursal_id = $1
        ORDER BY COALESCE(cerrado_en, created_at) DESC, created_at DESC`,
      [req.user.sucursalId]
    );
    res.json(rows.map(mapCierreCajaRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cierres-caja/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      'SELECT * FROM cierres_caja WHERE id = $1 AND sucursal_id = $2 LIMIT 1',
      [req.params.id, req.user.sucursalId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cierre no encontrado' });
    res.json(mapCierreCajaRow(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cierres-caja', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body || {};
    const descripcion = String(b.descripcion || '').trim();
    const fechaCierre = formatDateOnly(b.fecha);
    const horaCierre = normalizarHora(b.horaCierre);
    const montoRetirado = Number(b.montoRetirado ?? 0);

    if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
    if (!fechaCierre) return res.status(400).json({ error: 'Fecha requerida' });
    if (!Number.isFinite(montoRetirado) || montoRetirado < 0) {
      return res.status(400).json({ error: 'Monto retirado inválido' });
    }

    const [pagosRows, gastosRows, cierresRows] = await Promise.all([
      db.query(
        `SELECT p.*
           FROM pagos p
           LEFT JOIN alumnos a ON p.alumno_id = a.id
          WHERE a.sucursal_id = $1 OR (p.alumno_id IS NULL AND p.sucursal_id = $1)
          ORDER BY p.created_at DESC`,
        [req.user.sucursalId]
      ),
      db.query('SELECT * FROM gastos WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]),
      db.query('SELECT * FROM cierres_caja WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]),
    ]);

    const cierre = buildCierreCajaServer({
      descripcion,
      fechaCierre,
      horaCierre,
      montoRetirado,
      pagos: pagosRows.rows.map(mapPagoRow),
      gastos: gastosRows.rows.map(mapGastoRow),
      cierresExistentes: cierresRows.rows.map(mapCierreCajaRow),
    });

    await db.query(
      `INSERT INTO cierres_caja (
        id, sucursal_id, descripcion, fecha_cierre, cerrado_en, monto_retirado,
        saldo_antes_retiro, saldo_despues_retiro, fecha_desde, fecha_hasta,
        ingresos_efectivo, ingresos_transferencia, gastos_efectivo, gastos_transferencia,
        total_ingresos, total_gastos, neto, movimientos_count, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19
      )`,
      [
        cierre.id,
        req.user.sucursalId,
        cierre.descripcion,
        cierre.fechaCierre,
        cierre.cerradoEn || null,
        cierre.montoRetirado,
        cierre.saldoAntesRetiro ?? null,
        cierre.saldoDespuesRetiro ?? null,
        cierre.fechaDesde || null,
        cierre.fechaHasta || null,
        cierre.ingresosEfectivo ?? null,
        cierre.ingresosTransferencia ?? null,
        cierre.gastosEfectivo ?? null,
        cierre.gastosTransferencia ?? null,
        cierre.totalIngresos ?? null,
        cierre.totalGastos ?? null,
        cierre.neto ?? null,
        cierre.movimientosCount ?? null,
        cierre.createdAt,
      ]
    );

    res.status(201).json(cierre);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Profesores ---
app.get('/api/profesores', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM profesores WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]);
    res.json(rows.map((r) => ({ id: r.id, nombre: r.nombre, apellido: r.apellido, createdAt: r.created_at?.toISOString?.() ?? r.created_at })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profesores', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    await db.query(
      'INSERT INTO profesores (id, sucursal_id, nombre, apellido, created_at) VALUES ($1, $2, $3, $4, $5)',
      [b.id, req.user.sucursalId, b.nombre, b.apellido, b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/profesores/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.nombre !== undefined) { updates.push(`nombre = $${i++}`); values.push(b.nombre); }
    if (b.apellido !== undefined) { updates.push(`apellido = $${i++}`); values.push(b.apellido); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE profesores SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/profesores/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM profesores WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Turnos ---
app.get('/api/turnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM turnos WHERE sucursal_id = $1 ORDER BY created_at DESC', [req.user.sucursalId]);
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
      cupo: r.cupo != null ? Number(r.cupo) : 6,
      destacado: !!r.destacado,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/turnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const cupo = b.cupo != null ? Math.max(1, Number(b.cupo)) : 6;
    const destacado = !!b.destacado;
    await db.query(
      'INSERT INTO turnos (id, sucursal_id, dia_semana, hora, titulo, profesor_id, alumno_ids, cupo, destacado, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [b.id, req.user.sucursalId, b.diaSemana, b.hora, b.titulo || null, b.profesorId || null, b.alumnoIds || [], cupo, destacado, b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/turnos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.diaSemana !== undefined) { updates.push(`dia_semana = $${i++}`); values.push(b.diaSemana); }
    if (b.hora !== undefined) { updates.push(`hora = $${i++}`); values.push(b.hora); }
    if (b.titulo !== undefined) { updates.push(`titulo = $${i++}`); values.push(b.titulo || null); }
    if (b.profesorId !== undefined) { updates.push(`profesor_id = $${i++}`); values.push(b.profesorId || null); }
    if (b.alumnoIds !== undefined) { updates.push(`alumno_ids = $${i++}`); values.push(b.alumnoIds); }
    if (b.cupo !== undefined) { updates.push(`cupo = $${i++}`); values.push(Math.max(1, Number(b.cupo))); }
    if (b.destacado !== undefined) { updates.push(`destacado = $${i++}`); values.push(!!b.destacado); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE turnos SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/turnos/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM turnos WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/turnos/ajustar-cupo', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user.sucursalId;
    const { rows } = await db.query('SELECT id, alumno_ids, cupo FROM turnos WHERE sucursal_id = $1', [sid]);
    let turnosActualizados = 0;
    let alumnosEliminados = 0;
    for (const r of rows) {
      const ids = r.alumno_ids || [];
      const cupo = r.cupo != null ? Math.max(1, Number(r.cupo)) : 6;
      if (ids.length > cupo) {
        const nuevosIds = ids.slice(0, cupo);
        await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [nuevosIds, r.id, sid]);
        turnosActualizados++;
        alumnosEliminados += ids.length - cupo;
      }
    }
    res.json({ ok: true, turnosActualizados, alumnosEliminados });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/turnos/by-dia/:diaSemana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM turnos WHERE dia_semana = $1 AND sucursal_id = $2', [req.params.diaSemana, req.user.sucursalId]);
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
      cupo: r.cupo != null ? Number(r.cupo) : 6,
      destacado: !!r.destacado,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/turnos/by-dia-hora', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { diaSemana, hora } = req.query;
    const { rows } = await db.query('SELECT * FROM turnos WHERE dia_semana = $1 AND hora = $2 AND sucursal_id = $3', [diaSemana, hora, req.user.sucursalId]);
    if (rows.length === 0) return res.json(null);
    const r = rows[0];
    res.json({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
      cupo: r.cupo != null ? Number(r.cupo) : 6,
      destacado: !!r.destacado,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/turnos/by-alumno/:alumnoId', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query("SELECT * FROM turnos WHERE sucursal_id = $1 AND $2 = ANY(alumno_ids)", [req.user.sucursalId, req.params.alumnoId]);
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
      cupo: r.cupo != null ? Number(r.cupo) : 6,
      destacado: !!r.destacado,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Agenda / Notas ---
app.get('/api/agenda-notas', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      'SELECT * FROM agenda_notas WHERE sucursal_id = $1 ORDER BY fecha ASC NULLS LAST, hora ASC NULLS LAST, created_at DESC',
      [req.user.sucursalId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      titulo: r.titulo || '',
      contenido: r.contenido || '',
      fecha: typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : r.fecha?.toISOString?.().slice(0, 10) || '',
      hora: r.hora || '',
      importante: r.importante === true,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agenda-notas', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body || {};
    if (!String(b.titulo || '').trim()) return res.status(400).json({ error: 'Falta el título' });
    await db.query(
      'INSERT INTO agenda_notas (id, sucursal_id, titulo, contenido, fecha, hora, importante, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        b.id,
        req.user.sucursalId,
        String(b.titulo || '').trim(),
        String(b.contenido || ''),
        String(b.fecha || '').trim() ? String(b.fecha).slice(0, 10) : null,
        String(b.hora || '').trim() || null,
        b.importante === true,
        b.createdAt || new Date().toISOString(),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/agenda-notas/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (b.titulo !== undefined) { updates.push(`titulo = $${i++}`); values.push(String(b.titulo || '').trim()); }
    if (b.contenido !== undefined) { updates.push(`contenido = $${i++}`); values.push(String(b.contenido || '')); }
    if (b.fecha !== undefined) { updates.push(`fecha = $${i++}`); values.push(String(b.fecha || '').trim() ? String(b.fecha).slice(0, 10) : null); }
    if (b.hora !== undefined) { updates.push(`hora = $${i++}`); values.push(String(b.hora || '').trim() || null); }
    if (b.importante !== undefined) { updates.push(`importante = $${i++}`); values.push(b.importante === true); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id, req.user.sucursalId);
    await db.query(`UPDATE agenda_notas SET ${updates.join(', ')} WHERE id = $${i} AND sucursal_id = $${i + 1}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/agenda-notas/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM agenda_notas WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Horarios de sucursal (configurables por sucursal: ej. Savia 7-12, Nes 9-13) ---
function generarHorasDesdeHasta(inicio, fin) {
  const out = [];
  const [hI, mI] = (inicio || '07:00').split(':').map(Number);
  const [hF, mF] = (fin || '12:00').split(':').map(Number);
  let min = hI * 60 + mI;
  const end = hF * 60 + mF;
  while (min <= end) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    min += 60;
  }
  return out;
}

function normalizarHorariosNoDisponiblesPorDia(raw, horasValidas = null) {
  const out = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  if (!raw || typeof raw !== 'object') return out;
  const horasPermitidas = horasValidas ? new Set(horasValidas) : null;
  for (let dia = 0; dia <= 6; dia++) {
    const lista = raw[dia] ?? raw[String(dia)];
    if (!Array.isArray(lista)) continue;
    out[dia] = Array.from(new Set(
      lista
        .map((hora) => String(hora || '').slice(0, 5))
        .filter((hora) => /^\d{2}:\d{2}$/.test(hora) && (!horasPermitidas || horasPermitidas.has(hora)))
    )).sort();
  }
  return out;
}

app.get('/api/sucursal/horarios', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(403).json({ error: 'Acceso de sucursal requerido' });
    const { rows } = await db.query(
      `SELECT hora_inicio_manana, hora_fin_manana, hora_inicio_tarde, hora_fin_tarde,
              horarios_no_disponibles_por_dia,
              horas_antes_anotarse_clase, horas_antes_liberar_clase
         FROM sucursales
        WHERE id = $1`,
      [sid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
    const r = rows[0];
    const manana = generarHorasDesdeHasta(r.hora_inicio_manana || '07:00', r.hora_fin_manana || '12:00');
    const tarde = generarHorasDesdeHasta(r.hora_inicio_tarde || '16:00', r.hora_fin_tarde || '21:00');
    const horasValidas = [...manana, ...tarde];
    res.json({
      horaInicioManana: r.hora_inicio_manana || '07:00',
      horaFinManana: r.hora_fin_manana || '12:00',
      horaInicioTarde: r.hora_inicio_tarde || '16:00',
      horaFinTarde: r.hora_fin_tarde || '21:00',
      horariosNoDisponiblesPorDia: normalizarHorariosNoDisponiblesPorDia(r.horarios_no_disponibles_por_dia, horasValidas),
      horasAntesAnotarseClase: Math.max(0, Number(r.horas_antes_anotarse_clase ?? 0)),
      horasAntesLiberarClase: Math.max(0, Number(r.horas_antes_liberar_clase ?? 0)),
      manana,
      tarde,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/sucursal/horarios', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(403).json({ error: 'Acceso de sucursal requerido' });
    const b = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (b.horaInicioManana !== undefined) { updates.push(`hora_inicio_manana = $${i++}`); values.push(b.horaInicioManana || '07:00'); }
    if (b.horaFinManana !== undefined) { updates.push(`hora_fin_manana = $${i++}`); values.push(b.horaFinManana || '12:00'); }
    if (b.horaInicioTarde !== undefined) { updates.push(`hora_inicio_tarde = $${i++}`); values.push(b.horaInicioTarde || '16:00'); }
    if (b.horaFinTarde !== undefined) { updates.push(`hora_fin_tarde = $${i++}`); values.push(b.horaFinTarde || '21:00'); }
    if (b.horariosNoDisponiblesPorDia !== undefined) {
      const manana = generarHorasDesdeHasta(b.horaInicioManana || '07:00', b.horaFinManana || '12:00');
      const tarde = generarHorasDesdeHasta(b.horaInicioTarde || '16:00', b.horaFinTarde || '21:00');
      const horasValidas = [...manana, ...tarde];
      updates.push(`horarios_no_disponibles_por_dia = $${i++}`);
      values.push(JSON.stringify(normalizarHorariosNoDisponiblesPorDia(b.horariosNoDisponiblesPorDia, horasValidas)));
    }
    if (b.horasAntesAnotarseClase !== undefined) {
      updates.push(`horas_antes_anotarse_clase = $${i++}`);
      values.push(Math.max(0, parseInt(b.horasAntesAnotarseClase, 10) || 0));
    }
    if (b.horasAntesLiberarClase !== undefined) {
      updates.push(`horas_antes_liberar_clase = $${i++}`);
      values.push(Math.max(0, parseInt(b.horasAntesLiberarClase, 10) || 0));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(sid);
    await db.query(`UPDATE sucursales SET ${updates.join(', ')} WHERE id = $${i}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Portal alumno (sin auth: por token o por DNI) ---
function getSemanaActual() {
  const d = new Date();
  const año = d.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((d - inicioAño) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${String(semana).padStart(2, '0')}`;
}

function getFechaFromSemanaYDia(semana, diaSemana) {
  const [y, w] = String(semana || '').split('-').map(Number);
  if (!y || !w || Number.isNaN(Number(diaSemana))) return '';
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const d = new Date(mondayWeek1);
  d.setDate(d.getDate() + (w - 1) * 7 + Number(diaSemana));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getFechaHoraTurnoSemana(semana, diaSemana, hora) {
  const fecha = getFechaFromSemanaYDia(semana, diaSemana);
  if (!fecha) return null;
  return new Date(`${fecha}T${normalizarHora(hora)}:00-03:00`);
}

async function getPortalTimeLimits(db, sucursalId) {
  const { rows } = await db.query(
    'SELECT horas_antes_anotarse_clase, horas_antes_liberar_clase FROM sucursales WHERE id = $1',
    [sucursalId]
  );
  const row = rows[0] || {};
  return {
    horasAntesAnotarseClase: Math.max(0, Number(row.horas_antes_anotarse_clase ?? 0)),
    horasAntesLiberarClase: Math.max(0, Number(row.horas_antes_liberar_clase ?? 0)),
  };
}

async function validarTiempoPortal(db, sucursalId, { accion, semana, turno }) {
  const turnoInicio = getFechaHoraTurnoSemana(semana, turno?.dia_semana, turno?.hora);
  if (!turnoInicio || Number.isNaN(turnoInicio.getTime())) return;
  const limits = await getPortalTimeLimits(db, sucursalId);
  const horasLimite = accion === 'liberar'
    ? limits.horasAntesLiberarClase
    : limits.horasAntesAnotarseClase;
  if (!horasLimite || horasLimite <= 0) return;
  const msRestantes = turnoInicio.getTime() - Date.now();
  if (msRestantes < horasLimite * 60 * 60 * 1000) {
    const verbo = accion === 'liberar' ? 'liberar' : 'anotarte';
    const error = new Error(`Ya no se puede ${verbo} con menos de ${horasLimite} hora${horasLimite === 1 ? '' : 's'} de anticipación.`);
    error.status = 400;
    throw error;
  }
}
// Resuelve alumno por token o por dni (+ sucursalId opcional). Retorna { alumno, sucursalId } o error.
async function resolveAlumnoPortal(db, { token, dni, sucursalId }) {
  if (token && token.trim()) {
    const { rows } = await db.query(
      'SELECT id, nombre, apellido, dni, sucursal_id, actividad_id, clases_para_recuperar, fecha_vencimiento_cuota FROM alumnos WHERE link_token = $1 AND activo IS DISTINCT FROM false',
      [token.trim()]
    );
    if (rows.length === 0) return { error: 404, message: 'Link inválido o expirado' };
    return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  }
  const dniTrim = (dni || '').toString().trim();
  if (!dniTrim) return { error: 400, message: 'Ingresá tu DNI' };
  if (sucursalId && sucursalId.trim()) {
    const { rows } = await db.query(
      'SELECT id, nombre, apellido, dni, sucursal_id, actividad_id, clases_para_recuperar, fecha_vencimiento_cuota FROM alumnos WHERE dni = $1 AND sucursal_id = $2 AND activo IS DISTINCT FROM false',
      [dniTrim, sucursalId.trim()]
    );
    if (rows.length === 0) return { error: 404, message: 'No encontramos un alumno con ese DNI en esta sede' };
    return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  }
  const { rows } = await db.query(
    'SELECT id, nombre, apellido, dni, sucursal_id, actividad_id, clases_para_recuperar, fecha_vencimiento_cuota FROM alumnos WHERE dni = $1 AND activo IS DISTINCT FROM false',
    [dniTrim]
  );
  if (rows.length === 0) return { error: 404, message: 'No encontramos un alumno con ese DNI' };
  if (rows.length === 1) return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  const { rows: sucursales } = await db.query(
    'SELECT s.id, s.nombre_lugar FROM sucursales s WHERE s.id = ANY($1)',
    [rows.map((r) => r.sucursal_id)]
  );
  return { error: 400, sucursales, message: 'Hay varias sedes con ese DNI. Elegí tu sede.' };
}

async function getPortalRecuperacionContext(db, alumno, semanaVista, turnoRows) {
  const actividadId = alumno.actividad_id || null;
  let clasesPorSemana = null;
  if (actividadId) {
    const { rows: actividadRows } = await db.query(
      'SELECT clases_por_semana FROM actividades WHERE id = $1 AND sucursal_id = $2 LIMIT 1',
      [actividadId, alumno.sucursal_id]
    );
    if (actividadRows.length > 0 && actividadRows[0].clases_por_semana != null) {
      clasesPorSemana = Number(actividadRows[0].clases_por_semana);
    }
  }

  const { rows: insRows } = await db.query(
    'SELECT turno_id, alumno_id, semana_desde FROM inscripciones_turno WHERE alumno_id = $1',
    [alumno.id]
  );
  const insByTurno = new Map(insRows.map((r) => [r.turno_id, r]));
  const { rows: allLibRows } = await db.query(
    'SELECT id, turno_id, semana, created_at FROM liberaciones_semana WHERE alumno_id = $1 ORDER BY semana, created_at, id',
    [alumno.id]
  );
  const { rows: libCreditUseRows } = await db.query(
    "SELECT id, semana, created_at FROM recuperaciones WHERE alumno_id = $1 AND origen_credito = 'liberacion' ORDER BY semana, created_at, id",
    [alumno.id]
  );
  const consumedLiberacionCount = libCreditUseRows.length;
  const outstandingLiberacionIds = new Set(allLibRows.slice(consumedLiberacionCount).map((r) => r.id));
  const libRows = allLibRows.filter((r) => r.semana === semanaVista);
  const outstandingLibRows = libRows.filter((r) => outstandingLiberacionIds.has(r.id));
  const libByTurno = new Map(outstandingLibRows.map((r) => [r.turno_id, r]));
  const clasesFijasSemana = turnoRows.filter((t) => {
    const ids = t.alumno_ids || [];
    if (!ids.includes(alumno.id)) return false;
    const ins = insByTurno.get(t.id);
    return (!ins || ins.semana_desde <= semanaVista) && !libByTurno.has(t.id);
  }).length;

  const { rows: recRows } = await db.query(
    'SELECT id, turno_id, usa_credito, origen_credito FROM recuperaciones WHERE alumno_id = $1 AND semana = $2',
    [alumno.id, semanaVista]
  );

  return {
    clasesPorSemana,
    clasesFijasSemana,
    recuperacionesSemana: recRows,
    liberacionesSemana: libRows,
    liberacionesPendientesSemana: outstandingLibRows,
    liberacionesPendientesTotales: outstandingLiberacionIds.size,
    inscripcionesByTurno: insByTurno,
    clasesParaRecuperar: Math.max(0, Number(alumno.clases_para_recuperar ?? 0)),
  };
}

async function getActividadClasesPorSemana(db, alumno) {
  const actividadId = alumno.actividad_id || null;
  if (!actividadId) return null;
  const { rows } = await db.query(
    'SELECT clases_por_semana FROM actividades WHERE id = $1 AND sucursal_id = $2 LIMIT 1',
    [actividadId, alumno.sucursal_id]
  );
  if (!rows.length || rows[0].clases_por_semana == null) return null;
  return Number(rows[0].clases_por_semana);
}

async function getPortalHistorialAsistencias(db, alumnoId, sucursalId) {
  const { rows } = await db.query(
    `SELECT asi.id, asi.turno_id, asi.semana, asi.estado, asi.created_at,
            t.dia_semana, t.hora, t.titulo
       FROM asistencias asi
       JOIN turnos t ON asi.turno_id = t.id AND t.sucursal_id = $2
      WHERE asi.alumno_id = $1 AND asi.estado IN ('asistio', 'no_asistio')
      ORDER BY asi.created_at DESC
      LIMIT 60`,
    [alumnoId, sucursalId]
  );
  return rows.map((r) => ({
    id: r.id,
    turnoId: r.turno_id,
    semana: r.semana,
    diaSemana: r.dia_semana,
    hora: r.hora,
    titulo: r.titulo || 'Clase',
    fecha: getFechaFromSemanaYDia(r.semana, r.dia_semana),
    estado: r.estado,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  }));
}

async function getClasesFijasActivasSemana(db, alumno, semanaVista) {
  const { rows: turnoRows } = await db.query(
    'SELECT id, alumno_ids FROM turnos WHERE sucursal_id = $1',
    [alumno.sucursal_id]
  );
  const { rows: insRows } = await db.query(
    'SELECT turno_id, semana_desde FROM inscripciones_turno WHERE alumno_id = $1',
    [alumno.id]
  );
  const insByTurno = new Map(insRows.map((r) => [r.turno_id, r]));
  return turnoRows.filter((t) => {
    const ids = t.alumno_ids || [];
    if (!ids.includes(alumno.id)) return false;
    const ins = insByTurno.get(t.id);
    return !ins || ins.semana_desde <= semanaVista;
  }).length;
}

function alumnoActivoEnTurnoSemana(turno, alumnoId, semanaVista, insByTurnoAlumno) {
  const alumnoIds = turno.alumno_ids || [];
  if (!alumnoIds.includes(alumnoId)) return false;
  const ins = insByTurnoAlumno.get(`${turno.id}:${alumnoId}`);
  return !ins || ins.semana_desde <= semanaVista;
}

function getAlumnosActivosTurnoSemana(turno, semanaVista, insByTurnoAlumno) {
  const alumnoIds = turno.alumno_ids || [];
  return alumnoIds.filter((alumnoId) => {
    const ins = insByTurnoAlumno.get(`${turno.id}:${alumnoId}`);
    return !ins || ins.semana_desde <= semanaVista;
  });
}

app.get('/api/alumno-portal', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const token = (req.query.token || '').toString().trim();
    const dni = (req.query.dni || '').toString().trim();
    const sucursalId = (req.query.sucursalId || '').toString().trim();
    const modo = (req.query.modo || 'fijo').toString().toLowerCase();
    const semanaParam = (req.query.semana || '').toString().trim();
    const esRecuperar = modo === 'recuperar';
    const semanaVista = semanaParam || (esRecuperar ? getSemanaActual() : '');
    const resolved = await resolveAlumnoPortal(db, { token, dni, sucursalId });
    if (resolved.error) {
      if (resolved.sucursales) return res.status(400).json({ error: resolved.message, sucursales: resolved.sucursales });
      return res.status(resolved.error).json({ error: resolved.message });
    }
    const { alumno, sucursalId: sid } = resolved;
    const { rows: turnoRows } = await db.query('SELECT id, dia_semana, hora, titulo, alumno_ids, cupo FROM turnos WHERE sucursal_id = $1 ORDER BY dia_semana, hora', [sid]);
    const { rows: insRows } = await db.query(
      'SELECT turno_id, alumno_id, semana_desde FROM inscripciones_turno WHERE turno_id = ANY($1)',
      [turnoRows.map((r) => r.id)]
    );
    const { rows: horRows } = await db.query(
      'SELECT hora_inicio_manana, hora_fin_manana, hora_inicio_tarde, hora_fin_tarde FROM sucursales WHERE id = $1',
      [sid]
    );
    const insByTurno = new Map(insRows.map((r) => [`${r.turno_id}:${r.alumno_id}`, r]));
    const hor = horRows[0] || {};
    const actividadNombre = alumno.actividad_id
      ? (await db.query('SELECT nombre FROM actividades WHERE id = $1 AND sucursal_id = $2 LIMIT 1', [alumno.actividad_id, sid])).rows[0]?.nombre || ''
      : '';
    const historialAsistencias = await getPortalHistorialAsistencias(db, alumno.id, sid);
    const clasesFijas = turnoRows
      .filter((r) => {
        return alumnoActivoEnTurnoSemana(r, alumno.id, getSemanaActual(), insByTurno);
      })
      .map((r) => ({
        id: r.id,
        diaSemana: r.dia_semana,
        hora: r.hora,
        titulo: r.titulo || 'Clase',
      }));
    let turnos;
    let recuperacionStats = null;
    if (esRecuperar && semanaVista) {
      const ctx = await getPortalRecuperacionContext(db, alumno, semanaVista, turnoRows);
      const recRows = ctx.recuperacionesSemana;
      const libRows = ctx.liberacionesSemana;
      const { rows: recCountRows } = await db.query(
        'SELECT turno_id, COUNT(*) AS n FROM recuperaciones WHERE turno_id = ANY($1) AND semana = $2 GROUP BY turno_id',
        [turnoRows.map((r) => r.id), semanaVista]
      );
      const { rows: libCountRows } = await db.query(
        'SELECT turno_id, COUNT(*) AS n FROM liberaciones_semana WHERE turno_id = ANY($1) AND semana = $2 GROUP BY turno_id',
        [turnoRows.map((r) => r.id), semanaVista]
      );
      const recByTurno = new Map(recRows.map((r) => [r.turno_id, r]));
      const recCountByTurno = new Map(recCountRows.map((r) => [r.turno_id, parseInt(r.n, 10)]));
      const libByTurno = new Map(ctx.liberacionesPendientesSemana.map((r) => [r.turno_id, r]));
      const libCountByTurno = new Map(libCountRows.map((r) => [r.turno_id, parseInt(r.n, 10)]));
      turnos = turnoRows.map((r) => {
        const alumnoIds = r.alumno_ids || [];
        const cupo = r.cupo != null ? Number(r.cupo) : 6;
        const rec = recByTurno.get(r.id);
        const liberacion = libByTurno.get(r.id);
        const recCount = recCountByTurno.get(r.id) || 0;
        const libCount = libCountByTurno.get(r.id) || 0;
        const esClaseFija = alumnoActivoEnTurnoSemana(r, alumno.id, semanaVista, insByTurno);
        const fijosActivos = getAlumnosActivosTurnoSemana(r, semanaVista, insByTurno);
        const inscriptos = Math.max(0, fijosActivos.length - libCount + recCount);
        return {
          id: r.id,
          diaSemana: r.dia_semana,
          hora: r.hora,
          titulo: r.titulo || '',
          cupo,
          inscriptos,
          yaInscripto: !!rec,
          esClaseFija,
          claseLiberada: !!liberacion,
          ...(liberacion && { liberacionId: liberacion.id }),
          ...(rec && { recuperacionId: rec.id, usaCredito: !!rec.usa_credito }),
        };
      });
      const clasesUsadasSemana = ctx.clasesFijasSemana + recRows.length;
      recuperacionStats = {
        clasesPorSemana: ctx.clasesPorSemana,
        clasesFijasSemana: ctx.clasesFijasSemana,
        recuperacionesSemana: recRows.length,
        clasesUsadasSemana,
        clasesParaRecuperar: ctx.clasesParaRecuperar,
        clasesDisponiblesSemana:
          ctx.clasesPorSemana == null
            ? null
            : Math.max(0, ctx.clasesPorSemana + ctx.clasesParaRecuperar - clasesUsadasSemana),
      };
    } else {
      const semanaActual = getSemanaActual();
      turnos = turnoRows.map((r) => {
        const cupo = r.cupo != null ? Number(r.cupo) : 6;
        const fijosActivos = getAlumnosActivosTurnoSemana(r, semanaActual, insByTurno);
        return {
          id: r.id,
          diaSemana: r.dia_semana,
          hora: r.hora,
          titulo: r.titulo || '',
          cupo,
          inscriptos: fijosActivos.length,
          yaInscripto: alumnoActivoEnTurnoSemana(r, alumno.id, semanaActual, insByTurno),
        };
      });
    }
    const payload = {
      alumno: {
        id: alumno.id,
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        fechaVencimientoCuota: alumno.fecha_vencimiento_cuota?.toISOString?.().slice(0, 10) ?? alumno.fecha_vencimiento_cuota ?? '',
        clasesParaRecuperar: Math.max(0, Number(alumno.clases_para_recuperar ?? 0)),
        actividadNombre,
      },
      turnos,
      clasesFijas,
      historialAsistencias,
      sucursalId: sid,
      modo: esRecuperar ? 'recuperar' : 'fijo',
      ...(esRecuperar && semanaVista && { semanaVista }),
      ...(recuperacionStats ? { recuperacionStats } : {}),
      horarios: {
        horaInicioManana: hor.hora_inicio_manana || '07:00',
        horaFinManana: hor.hora_fin_manana || '12:00',
        horaInicioTarde: hor.hora_inicio_tarde || '16:00',
        horaFinTarde: hor.hora_fin_tarde || '21:00',
      },
    };
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alumno-portal/push-vapid-public', (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Notificaciones push no configuradas' });
  res.json({ vapidPublicKey: VAPID_PUBLIC });
});

app.post('/api/alumno-portal/push-subscribe', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, subscription } = req.body || {};
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return res.status(503).json({ error: 'Faltan configurar las notificaciones push en el servidor.' });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO push_subscriptions (id, sucursal_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET sucursal_id = $2, p256dh = $4, auth = $5`,
      [id, resolved.sucursalId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
        JSON.stringify({
          title: 'Notificaciones activadas',
          body: 'Listo: este dispositivo ya puede recibir avisos del estudio.',
        }),
        { TTL: 60 }
      );
    } catch (err) {
      console.error('[Push test alumno] Error', err?.statusCode || err?.message, 'endpoint:', subscription.endpoint?.slice(0, 60));
      return res.status(500).json({ error: 'Se registró el dispositivo, pero falló la notificación de prueba.' });
    }
    res.json({ ok: true, testSent: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/inscribir-recuperacion', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId, semana } = req.body || {};
    if (!turnoId) return res.status(400).json({ error: 'Falta turnoId' });
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    let semanaVista = (semana || '').toString().trim() || getSemanaActual();
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids, cupo, dia_semana, hora FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'anotarse', semana: semanaVista, turno: turnoRows[0] });
    const { rows: allTurnoRows } = await db.query('SELECT id, alumno_ids FROM turnos WHERE sucursal_id = $1', [alumno.sucursal_id]);
    const { rows: exist } = await db.query(
      'SELECT id FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
      [alumno.id, turnoId, semanaVista]
    );
    if (exist.length > 0) return res.json({ ok: true, message: 'Ya estás anotado para recuperar esta semana' });
    const ctx = await getPortalRecuperacionContext(db, alumno, semanaVista, allTurnoRows);
    const liberacionPropia = ctx.liberacionesSemana.find((l) => l.turno_id === turnoId);
    const insPropia = ctx.inscripcionesByTurno.get(turnoId);
    const esClaseFijaPropia = (turnoRows[0].alumno_ids || []).includes(alumno.id) && (!insPropia || insPropia.semana_desde <= semanaVista);
    if (esClaseFijaPropia && !liberacionPropia) {
      return res.status(400).json({ error: 'Esa ya es una clase fija tuya de esa semana. Si vas a faltar, primero liberala.' });
    }
    const t = turnoRows[0];
    const cupo = t.cupo != null ? Number(t.cupo) : 6;
    const { rows: recCount } = await db.query('SELECT COUNT(*) AS n FROM recuperaciones WHERE turno_id = $1 AND semana = $2', [turnoId, semanaVista]);
    const { rows: libCount } = await db.query('SELECT COUNT(*) AS n FROM liberaciones_semana WHERE turno_id = $1 AND semana = $2', [turnoId, semanaVista]);
    const totalFijos = Math.max(0, (t.alumno_ids || []).length - parseInt(libCount[0]?.n || '0', 10));
    const recs = parseInt(recCount[0]?.n || '0', 10);
    if (totalFijos + recs >= cupo) return res.status(400).json({ error: 'No hay cupo para recuperar esta semana' });
    const clasesUsadasSemana = ctx.clasesFijasSemana + ctx.recuperacionesSemana.length;
    const excedeBase = ctx.clasesPorSemana != null && clasesUsadasSemana >= ctx.clasesPorSemana;
    const debeConsumirCreditoPorLiberacion = ctx.liberacionesPendientesTotales > 0 && ctx.clasesParaRecuperar > 0;
    if (excedeBase && ctx.clasesParaRecuperar <= 0) {
      return res.status(400).json({ error: 'No te quedan clases para recuperar disponibles.' });
    }
    const id = crypto.randomUUID();
    const usaCredito = debeConsumirCreditoPorLiberacion || excedeBase;
    const origenCredito = debeConsumirCreditoPorLiberacion ? 'liberacion' : excedeBase ? 'saldo' : null;
    await db.query(
      'INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, usa_credito, origen_credito, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [id, turnoId, alumno.id, semanaVista, usaCredito, origenCredito]
    );
    if (usaCredito) {
      await db.query(
        'UPDATE alumnos SET clases_para_recuperar = GREATEST(0, COALESCE(clases_para_recuperar, 0) - 1) WHERE id = $1 AND sucursal_id = $2',
        [alumno.id, alumno.sucursal_id]
      );
    }
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'inscribio', alumno.id, turnoId]
    );
    const { rows: infoRec } = await db.query(
      'SELECT a.apellido, a.nombre, t.dia_semana, t.hora, t.titulo FROM alumnos a, turnos t WHERE a.id = $1 AND t.id = $2',
      [alumno.id, turnoId]
    );
    if (infoRec.length > 0) {
      const nombre = [infoRec[0].apellido, infoRec[0].nombre].filter(Boolean).join(', ');
      const dia = DIAS_SEMANA_ES[infoRec[0].dia_semana] ?? '';
      const turno = `${dia} ${infoRec[0].hora} - ${infoRec[0].titulo || 'Clase'}`;
      queuePushToSucursal(db, alumno.sucursal_id, {
        title: 'Recuperación: nueva anotación',
        body: `${nombre} se anotó para recuperar en ${turno}`,
      });
    }
    res.json({ ok: true, recuperacionId: id, usoCredito: usaCredito });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/liberar-recuperacion', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId, recuperacionId, semana: semanaBody } = req.body || {};
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    let turnoIdParaPush = turnoId;
    let semanaObjetivo = (semanaBody || '').toString().trim() || getSemanaActual();
    let devolvioCredito = false;
    if (recuperacionId) {
      const { rows: recRow } = await db.query('SELECT turno_id, usa_credito, semana FROM recuperaciones WHERE id = $1 AND alumno_id = $2', [recuperacionId, alumno.id]);
      if (recRow.length > 0) turnoIdParaPush = recRow[0].turno_id;
      devolvioCredito = !!recRow[0]?.usa_credito;
      if (recRow.length > 0 && recRow[0].semana) semanaObjetivo = recRow[0].semana;
      if (turnoIdParaPush) {
        const { rows: turnoRows } = await db.query('SELECT id, dia_semana, hora FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoIdParaPush, alumno.sucursal_id]);
        if (turnoRows.length > 0) {
          await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'liberar', semana: semanaObjetivo, turno: turnoRows[0] });
        }
      }
      const { rowCount } = await db.query(
        'DELETE FROM recuperaciones WHERE id = $1 AND alumno_id = $2',
        [recuperacionId, alumno.id]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Recuperación no encontrada' });
    } else if (turnoId) {
      const semana = semanaObjetivo;
      const { rows: turnoRows } = await db.query('SELECT id, dia_semana, hora FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
      if (turnoRows.length > 0) {
        await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'liberar', semana, turno: turnoRows[0] });
      }
      const { rows: recRows } = await db.query(
        'SELECT id, usa_credito FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
        [alumno.id, turnoId, semana]
      );
      devolvioCredito = recRows.some((r) => !!r.usa_credito);
      const { rowCount } = await db.query(
        'DELETE FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
        [alumno.id, turnoId, semana]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'No estabas anotado para recuperar' });
    } else {
      return res.status(400).json({ error: 'Falta turnoId o recuperacionId' });
    }
    if (devolvioCredito) {
      await db.query(
        'UPDATE alumnos SET clases_para_recuperar = COALESCE(clases_para_recuperar, 0) + 1 WHERE id = $1 AND sucursal_id = $2',
        [alumno.id, alumno.sucursal_id]
      );
    }
    if (turnoIdParaPush) {
      await db.query(
        'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, turnoIdParaPush]
      );
      const { rows: infoLib } = await db.query(
        'SELECT a.apellido, a.nombre, t.dia_semana, t.hora, t.titulo FROM alumnos a, turnos t WHERE a.id = $1 AND t.id = $2',
        [alumno.id, turnoIdParaPush]
      );
      if (infoLib.length > 0) {
        const nombre = [infoLib[0].apellido, infoLib[0].nombre].filter(Boolean).join(', ');
        const dia = DIAS_SEMANA_ES[infoLib[0].dia_semana] ?? '';
        const turno = `${dia} ${infoLib[0].hora} - ${infoLib[0].titulo || 'Clase'}`;
        queuePushToSucursal(db, alumno.sucursal_id, {
          title: 'Recuperación: cupo liberado',
          body: `${nombre} liberó recuperación en ${turno}`,
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/liberar-clase-semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId, semana } = req.body || {};
    if (!turnoId) return res.status(400).json({ error: 'Falta turnoId' });
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    let semanaVista = (semana || '').toString().trim() || getSemanaActual();
    const { rows: turnoRows } = await db.query(
      'SELECT id, alumno_ids, dia_semana, hora, titulo FROM turnos WHERE id = $1 AND sucursal_id = $2',
      [turnoId, alumno.sucursal_id]
    );
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const t = turnoRows[0];
    await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'liberar', semana: semanaVista, turno: t });
    const ids = t.alumno_ids || [];
    if (!ids.includes(alumno.id)) return res.status(400).json({ error: 'Esta no es una clase fija tuya.' });
    const { rows: insRows } = await db.query(
      'SELECT semana_desde FROM inscripciones_turno WHERE turno_id = $1 AND alumno_id = $2 LIMIT 1',
      [turnoId, alumno.id]
    );
    if (insRows.length > 0 && insRows[0].semana_desde > semanaVista) {
      return res.status(400).json({ error: 'Todavía no tenés esa clase asignada en esa semana.' });
    }
    const { rows: libRows } = await db.query(
      'SELECT id FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3',
      [turnoId, alumno.id, semanaVista]
    );
    if (libRows.length > 0) return res.json({ ok: true, liberacionId: libRows[0].id });
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO liberaciones_semana (id, turno_id, alumno_id, semana, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id, turnoId, alumno.id, semanaVista]
    );
    await db.query(
      'UPDATE alumnos SET clases_para_recuperar = COALESCE(clases_para_recuperar, 0) + 1 WHERE id = $1 AND sucursal_id = $2',
      [alumno.id, alumno.sucursal_id]
    );
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, turnoId]
    );
    const nombre = [alumno.apellido, alumno.nombre].filter(Boolean).join(', ');
    const dia = DIAS_SEMANA_ES[t.dia_semana] ?? '';
    const turno = `${dia} ${t.hora} - ${t.titulo || 'Clase'}`;
    queuePushToSucursal(db, alumno.sucursal_id, {
      title: 'Cupo liberado',
      body: `${nombre} liberó cupo en ${turno}`,
    });
    res.json({ ok: true, liberacionId: id });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/restaurar-clase-semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId, semana, liberacionId } = req.body || {};
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    let semanaVista = (semana || '').toString().trim() || getSemanaActual();
    const turnoIdTarget = (turnoId || '').toString().trim();
    const { rows: allTurnoRows } = await db.query('SELECT id, alumno_ids FROM turnos WHERE sucursal_id = $1', [alumno.sucursal_id]);
    const ctx = await getPortalRecuperacionContext(db, alumno, semanaVista, allTurnoRows);
    const recuperacionesConCreditoPorLiberacion = ctx.recuperacionesSemana.filter((r) => r.origen_credito === 'liberacion').length;
    const hayCreditoDeLiberacionSinUsar = ctx.liberacionesSemana.length > recuperacionesConCreditoPorLiberacion;
    let rowCount = 0;
    let turnoIdRestaurado = '';
    if (liberacionId) {
      const { rows: libRow } = await db.query(
        'SELECT turno_id, semana FROM liberaciones_semana WHERE id = $1 AND alumno_id = $2',
        [liberacionId, alumno.id]
      );
      if (libRow.length === 0) return res.status(404).json({ error: 'Liberación no encontrada' });
      turnoIdRestaurado = libRow[0].turno_id;
      if (libRow[0].semana) semanaVista = libRow[0].semana;
      if (ctx.clasesPorSemana != null && ctx.clasesFijasSemana + ctx.recuperacionesSemana.length + 1 > ctx.clasesPorSemana) {
        return res.status(400).json({ error: 'Ya usaste esa clase semanal con otra reserva. Liberá primero la otra clase para volver a tomar esta.' });
      }
      const { rows: turnoRows } = await db.query(
        `SELECT t.id, t.alumno_ids, t.cupo, t.dia_semana, t.hora,
                COALESCE((SELECT COUNT(*)::int FROM recuperaciones r WHERE r.turno_id = t.id AND r.semana = $2), 0) AS recs,
                COALESCE((SELECT COUNT(*)::int FROM liberaciones_semana l WHERE l.turno_id = t.id AND l.semana = $2), 0) AS libs
           FROM turnos t
          WHERE t.id = $1 AND t.sucursal_id = $3`,
        [turnoIdRestaurado, semanaVista, alumno.sucursal_id]
      );
      if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
      const t = turnoRows[0];
      await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'anotarse', semana: semanaVista, turno: t });
      const ocupacionActual = Math.max(0, (t.alumno_ids || []).length - Number(t.libs || 0) + Number(t.recs || 0));
      if (ocupacionActual >= Number(t.cupo ?? 6)) {
        return res.status(400).json({ error: 'No se puede volver a tomar la clase porque ya no hay cupo.' });
      }
      ({ rowCount } = await db.query(
        'DELETE FROM liberaciones_semana WHERE id = $1 AND alumno_id = $2',
        [liberacionId, alumno.id]
      ));
    } else if (turnoIdTarget) {
      turnoIdRestaurado = turnoIdTarget;
      if (ctx.clasesPorSemana != null && ctx.clasesFijasSemana + ctx.recuperacionesSemana.length + 1 > ctx.clasesPorSemana) {
        return res.status(400).json({ error: 'Ya usaste esa clase semanal con otra reserva. Liberá primero la otra clase para volver a tomar esta.' });
      }
      const { rows: turnoRows } = await db.query(
        `SELECT t.id, t.alumno_ids, t.cupo, t.dia_semana, t.hora,
                COALESCE((SELECT COUNT(*)::int FROM recuperaciones r WHERE r.turno_id = t.id AND r.semana = $2), 0) AS recs,
                COALESCE((SELECT COUNT(*)::int FROM liberaciones_semana l WHERE l.turno_id = t.id AND l.semana = $2), 0) AS libs
           FROM turnos t
          WHERE t.id = $1 AND t.sucursal_id = $3`,
        [turnoIdTarget, semanaVista, alumno.sucursal_id]
      );
      if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
      const t = turnoRows[0];
      await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'anotarse', semana: semanaVista, turno: t });
      const ocupacionActual = Math.max(0, (t.alumno_ids || []).length - Number(t.libs || 0) + Number(t.recs || 0));
      if (ocupacionActual >= Number(t.cupo ?? 6)) {
        return res.status(400).json({ error: 'No se puede volver a tomar la clase porque ya no hay cupo.' });
      }
      ({ rowCount } = await db.query(
        'DELETE FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3',
        [turnoIdTarget, alumno.id, semanaVista]
      ));
    } else {
      return res.status(400).json({ error: 'Falta turnoId o liberacionId' });
    }
    if (rowCount === 0) return res.status(404).json({ error: 'La clase no estaba liberada para esa semana.' });
    if (hayCreditoDeLiberacionSinUsar) {
      await db.query(
        'UPDATE alumnos SET clases_para_recuperar = GREATEST(0, COALESCE(clases_para_recuperar, 0) - 1) WHERE id = $1 AND sucursal_id = $2',
        [alumno.id, alumno.sucursal_id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/inscribir', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId } = req.body || {};
    if (!turnoId) return res.status(400).json({ error: 'Falta turnoId' });
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    const semanaActual = getSemanaActual();
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids, cupo, dia_semana, hora FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const t = turnoRows[0];
    await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'anotarse', semana: semanaActual, turno: t });
    const ids = t.alumno_ids || [];
    const cupo = t.cupo != null ? Number(t.cupo) : 6;
    if (ids.includes(alumno.id)) return res.json({ ok: true, message: 'Ya estabas inscripto' });
    if (ids.length >= cupo) return res.status(400).json({ error: 'No hay cupo disponible' });
    const clasesPorSemana = await getActividadClasesPorSemana(db, alumno);
    if (clasesPorSemana != null) {
      const clasesFijasActivas = await getClasesFijasActivasSemana(db, alumno, semanaActual);
      if (clasesFijasActivas >= clasesPorSemana) {
        return res.status(400).json({ error: `Este alumno tiene un plan de ${clasesPorSemana} ${clasesPorSemana === 1 ? 'clase' : 'clases'} por semana y ya alcanzó ese límite.` });
      }
    }
    const nuevosIds = [...ids, alumno.id];
    await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [nuevosIds, turnoId, alumno.sucursal_id]);
    await db.query(
      'INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING',
      [crypto.randomUUID(), turnoId, alumno.id, semanaActual]
    );
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'inscribio', alumno.id, turnoId]
    );
    const { rows: info } = await db.query(
      'SELECT a.apellido, a.nombre, t.dia_semana, t.hora, t.titulo FROM alumnos a, turnos t WHERE a.id = $1 AND t.id = $2',
      [alumno.id, turnoId]
    );
    if (info.length > 0) {
      const nombre = [info[0].apellido, info[0].nombre].filter(Boolean).join(', ');
      const dia = DIAS_SEMANA_ES[info[0].dia_semana] ?? '';
      const turno = `${dia} ${info[0].hora} - ${info[0].titulo || 'Clase'}`;
      queuePushToSucursal(db, alumno.sucursal_id, {
        title: 'Nueva anotación',
        body: `${nombre} se anotó en ${turno}`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/liberar', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, dni, sucursalId, turnoId } = req.body || {};
    if (!turnoId) return res.status(400).json({ error: 'Falta turnoId' });
    const resolved = await resolveAlumnoPortal(db, {
      token: (token || '').toString().trim(),
      dni: (dni || '').toString().trim(),
      sucursalId: (sucursalId || '').toString().trim(),
    });
    if (resolved.error) return res.status(resolved.error).json({ error: resolved.message });
    const alumno = resolved.alumno;
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids, dia_semana, hora FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    await validarTiempoPortal(db, alumno.sucursal_id, { accion: 'liberar', semana: getSemanaActual(), turno: turnoRows[0] });
    const ids = (turnoRows[0].alumno_ids || []).filter((id) => id !== alumno.id);
    await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [ids, turnoId, alumno.sucursal_id]);
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, turnoId]
    );
    const { rows: info } = await db.query(
      'SELECT a.apellido, a.nombre, t.dia_semana, t.hora, t.titulo FROM alumnos a, turnos t WHERE a.id = $1 AND t.id = $2',
      [alumno.id, turnoId]
    );
    if (info.length > 0) {
      const nombre = [info[0].apellido, info[0].nombre].filter(Boolean).join(', ');
      const dia = DIAS_SEMANA_ES[info[0].dia_semana] ?? '';
      const turno = `${dia} ${info[0].hora} - ${info[0].titulo || 'Clase'}`;
      queuePushToSucursal(db, alumno.sucursal_id, {
        title: 'Cupo liberado',
        body: `${nombre} liberó cupo en ${turno}`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// --- Notificaciones (panel usuario: anotaciones y cancelaciones) ---
app.get('/api/notificaciones', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rows } = await db.query(
      `SELECT n.id, n.tipo, n.created_at, n.leido,
        a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
        t.dia_semana, t.hora, t.titulo AS turno_titulo
       FROM notificaciones n
       JOIN alumnos a ON n.alumno_id = a.id
       JOIN turnos t ON n.turno_id = t.id
       WHERE n.sucursal_id = $1
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [sid]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      leido: !!r.leido,
      alumnoNombre: [r.alumno_apellido, r.alumno_nombre].filter(Boolean).join(', '),
      turnoDia: DIAS_SEMANA_ES[r.dia_semana] ?? `Día ${r.dia_semana}`,
      turnoHora: r.hora,
      turnoTitulo: r.turno_titulo || 'Clase',
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/notificaciones/marcar-leidas', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { todas, ids } = req.body || {};
    if (todas) {
      await db.query('UPDATE notificaciones SET leido = true WHERE sucursal_id = $1', [sid]);
    } else if (Array.isArray(ids) && ids.length > 0) {
      await db.query(
        'UPDATE notificaciones SET leido = true WHERE sucursal_id = $1 AND id = ANY($2)',
        [sid, ids]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Push al celular (Web Push) ---
async function sendPushToSucursal(db, sucursalId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[Push] No enviado: faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en el servidor. Configuralas en Railway (o .env).');
    return;
  }
  const { rows } = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE sucursal_id = $1',
    [sucursalId]
  );
  if (rows.length === 0) {
    console.warn('[Push] No enviado: ningún dispositivo registrado para la sucursal', sucursalId, '- Entrá a Notificaciones y tocá "Activar notificaciones en este dispositivo".');
    return;
  }
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 120 }
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
        console.warn('[Push] Suscripción expirada, eliminada.');
      } else {
        console.error('[Push] Error', err.statusCode || err.message, 'endpoint:', sub.endpoint?.slice(0, 60));
      }
    }
  }
  if (sent > 0) console.log('[Push] Enviado a', sent, 'dispositivo(s):', payload.title);
}

function queuePushToSucursal(db, sucursalId, payload) {
  Promise.resolve()
    .then(() => sendPushToSucursal(db, sucursalId, payload))
    .catch((err) => {
      console.error('[Push] Error async', err?.statusCode || err?.message || err);
    });
}

app.get('/api/push-vapid-public', (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Notificaciones push no configuradas' });
  res.json({ vapidPublicKey: VAPID_PUBLIC });
});

app.get('/api/push-status', async (req, res) => {
  try {
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(401).json({ error: 'No autorizado' });
    const db = await getPool();
    if (!db) return res.json({ configured: !!VAPID_PUBLIC, subscriptionsCount: 0 });
    const { rows } = await db.query(
      'SELECT COUNT(*) AS n FROM push_subscriptions WHERE sucursal_id = $1',
      [sid]
    );
    res.json({
      configured: !!(VAPID_PUBLIC && VAPID_PRIVATE),
      subscriptionsCount: parseInt(rows[0]?.n || '0', 10),
    });
  } catch (e) {
    res.json({ configured: !!VAPID_PUBLIC, subscriptionsCount: 0 });
  }
});

app.post('/api/push-subscribe', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { subscription } = req.body || {};
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return res.status(503).json({ error: 'Faltan configurar las notificaciones push en el servidor.' });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO push_subscriptions (id, sucursal_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET sucursal_id = $2, p256dh = $4, auth = $5`,
      [id, sid, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
        JSON.stringify({
          title: 'Notificaciones activadas',
          body: 'Listo: este dispositivo ya puede recibir avisos del estudio.',
        }),
        { TTL: 60 }
      );
    } catch (err) {
      console.error('[Push test sucursal] Error', err?.statusCode || err?.message, 'endpoint:', subscription.endpoint?.slice(0, 60));
      return res.status(500).json({ error: 'Se registró el dispositivo, pero falló la notificación de prueba.' });
    }
    res.json({ ok: true, testSent: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Asistencias ---
app.get('/api/asistencias', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      'SELECT asi.* FROM asistencias asi JOIN turnos t ON asi.turno_id = t.id WHERE t.sucursal_id = $1 ORDER BY asi.created_at DESC',
      [req.user.sucursalId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      turnoId: r.turno_id,
      alumnoId: r.alumno_id,
      estado: r.estado,
      creditoOtorgado: r.credito_otorgado === true,
      semana: r.semana,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/asistencias/by-semana/:semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      'SELECT asi.* FROM asistencias asi JOIN turnos t ON asi.turno_id = t.id WHERE asi.semana = $1 AND t.sucursal_id = $2',
      [req.params.semana, req.user.sucursalId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      turnoId: r.turno_id,
      alumnoId: r.alumno_id,
      estado: r.estado,
      creditoOtorgado: r.credito_otorgado === true,
      semana: r.semana,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/asistencias', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    await db.query(
      'INSERT INTO asistencias (id, turno_id, alumno_id, estado, credito_otorgado, semana, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [b.id, b.turnoId, b.alumnoId, b.estado || null, b.creditoOtorgado === true, b.semana, b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/asistencias/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.estado !== undefined) { updates.push(`estado = $${i++}`); values.push(b.estado); }
    if (b.creditoOtorgado !== undefined) { updates.push(`credito_otorgado = $${i++}`); values.push(b.creditoOtorgado === true); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    await db.query(`UPDATE asistencias SET ${updates.join(', ')} WHERE id = $${i}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/asistencias/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM asistencias WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/asistencias/by-semana/:semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    await db.query('DELETE FROM asistencias WHERE semana = $1', [req.params.semana]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Recuperaciones: alumnos temporales para recuperar clase (desaparecen al reiniciar semana)
app.get('/api/recuperaciones/by-semana/:semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rows } = await db.query(
      `SELECT r.id, r.turno_id AS "turnoId", r.alumno_id AS "alumnoId", r.semana, r.usa_credito AS "usaCredito", r.created_at AS "createdAt"
       FROM recuperaciones r
       JOIN turnos t ON r.turno_id = t.id AND t.sucursal_id = $1
       WHERE r.semana = $2`,
      [sid, req.params.semana]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recuperaciones', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { turnoId, alumnoId, semana, usaCredito } = req.body || {};
    if (!turnoId || !alumnoId || !semana) return res.status(400).json({ error: 'Faltan turnoId, alumnoId o semana' });
    const { rows: turnoRows } = await db.query('SELECT id FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, sid]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, usa_credito, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [id, turnoId, alumnoId, semana, !!usaCredito]
    );
    res.status(201).json({ id, turnoId, alumnoId, semana, usaCredito: !!usaCredito, createdAt: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/recuperaciones/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rowCount } = await db.query(
      'DELETE FROM recuperaciones r USING turnos t WHERE r.turno_id = t.id AND t.sucursal_id = $1 AND r.id = $2',
      [sid, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Recuperación no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/recuperaciones/by-semana/:semana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    await db.query(
      'DELETE FROM recuperaciones r USING turnos t WHERE r.turno_id = t.id AND t.sucursal_id = $1 AND r.semana = $2',
      [sid, req.params.semana]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Inscripciones turno: alumno en turno desde qué semana (semanas anteriores no lo muestran)
app.get('/api/inscripciones-turno', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rows } = await db.query(
      `SELECT i.id, i.turno_id AS "turnoId", i.alumno_id AS "alumnoId", i.semana_desde AS "semanaDesde", i.created_at AS "createdAt"
       FROM inscripciones_turno i
       JOIN turnos t ON i.turno_id = t.id AND t.sucursal_id = $1`,
      [sid]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inscripciones-turno', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { turnoId, alumnoId, semanaDesde } = req.body || {};
    if (!turnoId || !alumnoId || !semanaDesde) return res.status(400).json({ error: 'Faltan turnoId, alumnoId o semanaDesde' });
    const { rows: turnoRows } = await db.query('SELECT id FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, sid]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id, turnoId, alumnoId, semanaDesde]
    );
    res.status(201).json({ id, turnoId, alumnoId, semanaDesde, createdAt: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/inscripciones-turno/:turnoId/:alumnoId', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    await db.query(
      'DELETE FROM inscripciones_turno i USING turnos t WHERE i.turno_id = t.id AND t.sucursal_id = $1 AND i.turno_id = $2 AND i.alumno_id = $3',
      [sid, req.params.turnoId, req.params.alumnoId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Auth login (contra la BDD)
app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ ok: false, error: 'Base de datos no configurada' });
    const { usuario, password } = req.body || {};
    if (!usuario || !password) return res.status(400).json({ ok: false, error: 'Faltan usuario o contraseña' });
    const u = usuario.trim();
    const adminUserEnv = (process.env.ADMIN_USER || 'adminF').trim();
    const isAdminUser = u === adminUserEnv;
    const { rows: adminRows } = await db.query('SELECT id, clave_hash FROM admin WHERE usuario = $1', [u]);
    if (adminRows.length > 0) {
      const valid = await bcrypt.compare(password, adminRows[0].clave_hash);
      if (!valid) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
      const token = jwt.sign({ role: 'admin', sub: adminRows[0].id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ ok: true, token, role: 'admin' });
    }
    if (isAdminUser) {
      return res.status(401).json({
        ok: false,
        error: 'Cuenta admin no configurada en la base de datos. Ejecutá: npm run db:schema (con DATABASE_URL). Para actualizar usuario/contraseña: npm run admin:update (con ADMIN_USER y ADMIN_PASSWORD).',
      });
    }
    const { rows: sucRows } = await db.query(
      'SELECT id, nombre_lugar, usuario, clave_hash, foto_perfil, activa, fecha_vencimiento_cuenta FROM sucursales WHERE usuario = $1',
      [u]
    );
    if (sucRows.length === 0) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    const valid = await bcrypt.compare(password, sucRows[0].clave_hash);
    if (!valid) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    const s = sucRows[0];
    if (s.activa === false) {
      return res.status(403).json({
        ok: false,
        error: 'Cuenta desactivada por falta de pago. Contactá al administrador para regularizar.',
      });
    }
    if (s.fecha_vencimiento_cuenta && new Date(s.fecha_vencimiento_cuenta) < new Date()) {
      return res.status(403).json({
        ok: false,
        error: 'Cuenta desactivada por falta de pago. Contactá al administrador para regularizar.',
      });
    }
    const token = jwt.sign(
      { role: 'sucursal', sub: s.id, sucursalId: s.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      ok: true,
      token,
      role: 'sucursal',
      sucursalId: s.id,
      sucursalNombre: s.nombre_lugar,
      fotoPerfil: s.foto_perfil || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Seed de prueba (10 actividades, 100 alumnos, turnos) — para ejecutar en Railway
const SEED_ACTIVIDADES = [
  { nombre: 'Pilates Mat', precio: 25000 },
  { nombre: 'Pilates Reformer', precio: 32000 },
  { nombre: 'Pilates con Aro', precio: 28000 },
  { nombre: 'Estiramiento', precio: 18000 },
  { nombre: 'Pilates Suelo', precio: 22000 },
  { nombre: 'Pilates Integrativo', precio: 30000 },
  { nombre: 'Pilates Prenatal', precio: 28000 },
  { nombre: 'Pilates para Adultos Mayores', precio: 20000 },
  { nombre: 'Pilates Avanzado', precio: 35000 },
  { nombre: 'Pilates Inicial', precio: 20000 },
];
const SEED_NOMBRES = ['Francisco', 'María', 'Juan', 'Ana', 'Carlos', 'Lucía', 'Martín', 'Sofía', 'Diego', 'Valentina', 'Javier', 'Camila', 'Luis', 'Victoria', 'Pablo', 'Emma', 'Andrés', 'Miguel', 'Ricardo', 'Fernando', 'Gonzalo', 'Emilio', 'Alejandro', 'Daniel', 'Gabriel', 'Héctor', 'Ignacio', 'Nicolás'];
const SEED_APELLIDOS = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Fernández', 'Gómez', 'Díaz', 'Torres', 'Ruiz', 'Hernández', 'Sánchez', 'Romero', 'Flores', 'Acosta', 'Benítez', 'Silva', 'Mendoza', 'Castro', 'Vargas', 'Ríos', 'Suárez', 'Molina', 'Ortiz', 'Núñez', 'Cabrera', 'Ramos', 'Vega', 'Luna'];
const SEED_HORARIOS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

function seedRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function seedRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

app.post('/api/seed-demo', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(403).json({ error: 'Tenés que estar logueado como sucursal para cargar datos de prueba' });
    const client = await db.connect();
    try {
      const actividadIds = [];
      for (let i = 0; i < SEED_ACTIVIDADES.length; i++) {
        const id = `act-demo-${crypto.randomUUID().slice(0, 8)}-${i + 1}`;
        await client.query(
          'INSERT INTO actividades (id, sucursal_id, nombre, precio) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET nombre = $3, precio = $4',
          [id, sid, SEED_ACTIVIDADES[i].nombre, SEED_ACTIVIDADES[i].precio]
        );
        actividadIds.push(id);
      }
      let { rows: profs } = await client.query('SELECT id FROM profesores WHERE sucursal_id = $1 LIMIT 2', [sid]);
      const profesorIds = profs.map((r) => r.id);
      if (profesorIds.length < 2) {
        const [nombres, apellidos] = [['Laura', 'Pedro'], ['Pilates', 'Instructor']];
        for (let i = profesorIds.length; i < 2; i++) {
          const id = crypto.randomUUID();
          await client.query('INSERT INTO profesores (id, sucursal_id, nombre, apellido) VALUES ($1, $2, $3, $4)', [id, sid, nombres[i], apellidos[i]]);
          profesorIds.push(id);
        }
      }
      for (let i = 0; i < 100; i++) {
        const id = crypto.randomUUID();
        const dni = `90${String(i).padStart(6, '0')}`;
        const nombre = seedRandomItem(SEED_NOMBRES);
        const apellido = seedRandomItem(SEED_APELLIDOS);
        const telefono = `223${String(seedRandomInt(1000000, 9999999))}`;
        const email = `demo${i}+${nombre.toLowerCase()}@prueba.com`;
        const actividadId = seedRandomItem(actividadIds);
        const f = new Date();
        f.setDate(f.getDate() + seedRandomInt(-10, 30));
        const fechaVencStr = f.toISOString().slice(0, 10);
        const dniUnico = `90-${sid.slice(0, 6)}-${String(i).padStart(4, '0')}`;
        await client.query(
          'INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW())',
          [id, sid, nombre, apellido, dniUnico, telefono, email, fechaVencStr, actividadId]
        );
      }
      const { rows: alumnosRows } = await client.query("SELECT id FROM alumnos WHERE sucursal_id = $1 AND dni LIKE '90-%'", [sid]);
      const idsParaTurnos = alumnosRows.map((r) => r.id);
      let turnosCreados = 0;
      for (let dia = 0; dia < 6; dia++) {
        for (const hora of SEED_HORARIOS) {
          const turnoId = crypto.randomUUID();
          const profesorId = seedRandomItem(profesorIds);
          const cantidad = idsParaTurnos.length === 0 ? 0 : seedRandomInt(3, Math.min(10, idsParaTurnos.length));
          const shuffled = [...idsParaTurnos].sort(() => Math.random() - 0.5);
          const asignados = cantidad === 0 ? [] : shuffled.slice(0, cantidad);
          await client.query(
            'INSERT INTO turnos (id, sucursal_id, dia_semana, hora, titulo, profesor_id, alumno_ids, cupo, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 6, NOW())',
            [turnoId, sid, dia, hora, `Clase ${hora}`, profesorId, asignados]
          );
          turnosCreados++;
        }
      }
      res.json({
        ok: true,
        actividades: actividadIds.length,
        alumnos: idsParaTurnos.length,
        turnos: turnosCreados,
        mensaje: 'Seed de prueba listo. Recargá la app.',
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error seed-demo:', e);
    res.status(500).json({ error: e.message, ok: false });
  }
});

// --- Admin: sucursales ---
app.get('/api/admin/sucursales', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      `SELECT s.id, s.nombre_lugar, s.usuario, s.foto_perfil, s.pago_mensual, s.fecha_vencimiento_cuenta, s.activa,
        s.hora_inicio_manana, s.hora_fin_manana, s.hora_inicio_tarde, s.hora_fin_tarde,
        s.horas_antes_anotarse_clase, s.horas_antes_liberar_clase, s.created_at,
        (SELECT COUNT(*) FROM alumnos a WHERE a.sucursal_id = s.id) AS cantidad_alumnos,
        (SELECT COUNT(*) FROM actividades ac WHERE ac.sucursal_id = s.id) AS cantidad_actividades,
        (SELECT COUNT(*) FROM profesores p WHERE p.sucursal_id = s.id) AS cantidad_profesores
       FROM sucursales s ORDER BY s.created_at DESC`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      nombreLugar: r.nombre_lugar,
      usuario: r.usuario,
      fotoPerfil: r.foto_perfil,
      pagoMensual: r.pago_mensual != null ? Number(r.pago_mensual) : null,
      fechaVencimientoCuenta: r.fecha_vencimiento_cuenta ? r.fecha_vencimiento_cuenta.toISOString().slice(0, 10) : null,
      activa: r.activa !== false,
      horaInicioManana: r.hora_inicio_manana || '07:00',
      horaFinManana: r.hora_fin_manana || '12:00',
      horaInicioTarde: r.hora_inicio_tarde || '16:00',
      horaFinTarde: r.hora_fin_tarde || '21:00',
      horasAntesAnotarseClase: Math.max(0, Number(r.horas_antes_anotarse_clase ?? 0)),
      horasAntesLiberarClase: Math.max(0, Number(r.horas_antes_liberar_clase ?? 0)),
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      cantidadAlumnos: Number(r.cantidad_alumnos ?? 0),
      cantidadActividades: Number(r.cantidad_actividades ?? 0),
      cantidadProfesores: Number(r.cantidad_profesores ?? 0),
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/sucursales', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(b.password || '1234', 10);
    await db.query(
      `INSERT INTO sucursales (id, nombre_lugar, usuario, clave_hash, foto_perfil, pago_mensual, fecha_vencimiento_cuenta, activa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        id,
        (b.nombreLugar || b.nombre_lugar || '').trim(),
        (b.usuario || '').trim(),
        hash,
        b.fotoPerfil || b.foto_perfil || null,
        b.pagoMensual != null ? b.pagoMensual : null,
        b.fechaVencimientoCuenta || null,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/sucursales/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const b = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (b.nombreLugar !== undefined) { updates.push(`nombre_lugar = $${i++}`); values.push(b.nombreLugar); }
    if (b.usuario !== undefined) { updates.push(`usuario = $${i++}`); values.push(b.usuario); }
    if (b.password !== undefined && b.password.trim() !== '') {
      const hash = await bcrypt.hash(b.password, 10);
      updates.push(`clave_hash = $${i++}`);
      values.push(hash);
    }
    if (b.fotoPerfil !== undefined) { updates.push(`foto_perfil = $${i++}`); values.push(b.fotoPerfil); }
    if (b.pagoMensual !== undefined) { updates.push(`pago_mensual = $${i++}`); values.push(b.pagoMensual === '' || b.pagoMensual == null ? null : Number(b.pagoMensual)); }
    if (b.fechaVencimientoCuenta !== undefined) { updates.push(`fecha_vencimiento_cuenta = $${i++}`); values.push(b.fechaVencimientoCuenta || null); }
    if (typeof b.activa === 'boolean') { updates.push(`activa = $${i++}`); values.push(b.activa); }
    if (b.horaInicioManana !== undefined) { updates.push(`hora_inicio_manana = $${i++}`); values.push(b.horaInicioManana || '07:00'); }
    if (b.horaFinManana !== undefined) { updates.push(`hora_fin_manana = $${i++}`); values.push(b.horaFinManana || '12:00'); }
    if (b.horaInicioTarde !== undefined) { updates.push(`hora_inicio_tarde = $${i++}`); values.push(b.horaInicioTarde || '16:00'); }
    if (b.horaFinTarde !== undefined) { updates.push(`hora_fin_tarde = $${i++}`); values.push(b.horaFinTarde || '21:00'); }
    if (b.horasAntesAnotarseClase !== undefined) { updates.push(`horas_antes_anotarse_clase = $${i++}`); values.push(Math.max(0, parseInt(b.horasAntesAnotarseClase, 10) || 0)); }
    if (b.horasAntesLiberarClase !== undefined) { updates.push(`horas_antes_liberar_clase = $${i++}`); values.push(Math.max(0, parseInt(b.horasAntesLiberarClase, 10) || 0)); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    await db.query(`UPDATE sucursales SET ${updates.join(', ')} WHERE id = $${i}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health (comprueba si hay DATABASE_URL y conexión)
app.get('/api/health', async (req, res) => {
  const db = await getPool();
  res.json({ ok: true, db: !!db });
});

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function resolveSucursalBrandForPublicRequest(db, req) {
  if (!db) return null;
  const sucursalId = (req.query.sucursalId || '').toString().trim();
  const token = (req.query.token || '').toString().trim();

  if (sucursalId) {
    const { rows } = await db.query(
      'SELECT id, nombre_lugar, foto_perfil FROM sucursales WHERE id = $1 LIMIT 1',
      [sucursalId]
    );
    return rows[0] || null;
  }

  if (token) {
    const { rows } = await db.query(
      `SELECT s.id, s.nombre_lugar, s.foto_perfil
         FROM alumnos a
         JOIN sucursales s ON s.id = a.sucursal_id
        WHERE a.link_token = $1
          AND a.activo IS DISTINCT FROM false
        LIMIT 1`,
      [token]
    );
    return rows[0] || null;
  }

  return null;
}

function getPublicLogoUrl(req, sucursalId) {
  const origin = getRequestOrigin(req);
  if (!sucursalId) return `${origin}/fitgest.png`;
  return `${origin}/api/public/sucursal-logo/${encodeURIComponent(sucursalId)}`;
}

function buildShareMeta(req, sucursal) {
  const origin = getRequestOrigin(req);
  const currentUrl = `${origin}${req.originalUrl}`;
  const nombre = sucursal?.nombre_lugar || 'FitGest';
  const esRegistro = req.path === '/registro';
  const title = esRegistro
    ? `${nombre} - Inscripción`
    : `${nombre} - Tu Clase`;
  const description = esRegistro
    ? `Inscripción online de ${nombre}. Completá tus datos y te contactamos.`
    : `Portal de alumnos de ${nombre}. Entrá a Tu Clase y gestioná tus clases y recuperaciones.`;
  const image = getPublicLogoUrl(req, sucursal?.id);
  return {
    title,
    description,
    image,
    url: currentUrl,
    appleTitle: nombre,
  };
}

function injectShareMetaIntoHtml(html, meta) {
  const cleaned = html
    .replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="apple-mobile-web-app-title" content=".*?" \/>/i, `<meta name="apple-mobile-web-app-title" content="${escapeHtml(meta.appleTitle)}" />`)
    .replace(/<link rel="apple-touch-icon" href=".*?" \/>/i, `<link rel="apple-touch-icon" href="${escapeHtml(meta.image)}" />`);

  const injected = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.image)}" />
  `;
  return cleaned.replace('</head>', `${injected}\n</head>`);
}

// Manifest PWA dinámico: nombre e icono según sucursal abierta
app.get('/api/manifest.webmanifest', async (req, res) => {
  try {
    const db = await getPool();
    const sucursal = await resolveSucursalBrandForPublicRequest(db, req);
    const esPortalAlumno = (req.query.portal || '').toString().trim().toLowerCase() === 'alumno';
    const brand = (req.query.brand || '').toString().trim().toLowerCase().replace(/\s+/g, '');
    const fallbackName = brand === 'fitgest'
      ? 'FitGest'
      : brand
        ? brand.charAt(0).toUpperCase() + brand.slice(1)
        : 'FitGest';
    const name = sucursal?.nombre_lugar || fallbackName;
    const icon = sucursal?.id ? getPublicLogoUrl(req, sucursal.id) : '/fitgest.png';
    const startUrl = '/';
    const appName = esPortalAlumno ? `${name} - Tu Clase` : `${name} - Sistema de Gestión`;
    const shortName = esPortalAlumno ? 'Tu Clase' : name;
    const description = esPortalAlumno
      ? 'Portal de alumnos para ver perfil, clases y recuperaciones'
      : 'Sistema de gestión para Pilates';
    const scope = '/';

    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'no-store');
    res.json({
      name: appName,
      short_name: shortName,
      description,
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'portrait',
      scope,
      start_url: startUrl,
      icons: [
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  } catch (e) {
    console.error(e);
    const esPortalAlumno = (req.query.portal || '').toString().trim().toLowerCase() === 'alumno';
    const startUrl = '/';
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'no-store');
    res.json({
      name: esPortalAlumno ? 'Tu Clase' : 'FitGest - Sistema de Gestión',
      short_name: esPortalAlumno ? 'Tu Clase' : 'FitGest',
      description: esPortalAlumno ? 'Portal de alumnos para ver perfil, clases y recuperaciones' : 'Sistema de gestión para Pilates',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: startUrl,
      icons: [
        { src: '/fitgest.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/fitgest.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  }
});

app.get('/api/public/sucursal-brand', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sucursal = await resolveSucursalBrandForPublicRequest(db, req);
    if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada' });
    res.set('Cache-Control', 'no-store');
    res.json({
      id: sucursal.id,
      nombreLugar: sucursal.nombre_lugar,
      logoUrl: getPublicLogoUrl(req, sucursal.id),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/public/sucursal-logo/:id', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.redirect('/fitgest.png');
    const { rows } = await db.query(
      'SELECT foto_perfil FROM sucursales WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    const foto = rows[0]?.foto_perfil || '';
    if (!foto) return res.redirect('/fitgest.png');

    if (foto.startsWith('data:')) {
      const match = foto.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.redirect('/fitgest.png');
      const [, mime, base64] = match;
      res.set('Content-Type', mime);
      res.set('Cache-Control', 'no-store');
      return res.send(Buffer.from(base64, 'base64'));
    }

    if (/^https?:\/\//i.test(foto)) {
      return res.redirect(foto);
    }

    if (foto.startsWith('/')) {
      return res.redirect(foto);
    }

    return res.redirect('/fitgest.png');
  } catch (e) {
    console.error(e);
    res.redirect('/fitgest.png');
  }
});

// Servir frontend estático (después de build)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.get(['/mi-clase', '/registro'], async (req, res) => {
    try {
      const db = await getPool();
      const sucursal = await resolveSucursalBrandForPublicRequest(db, req);
      const baseHtml = readFileSync(join(distPath, 'index.html'), 'utf8');
      const html = injectShareMetaIntoHtml(baseHtml, buildShareMeta(req, sucursal));
      res.set('Cache-Control', 'no-store');
      res.send(html);
    } catch (e) {
      console.error(e);
      res.sendFile(join(distPath, 'index.html'));
    }
  });
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'), (err) => {
      if (err) res.status(500).send('Error cargando la aplicación.');
    });
  });
} else {
  app.get('*', (req, res) => res.send('Frontend no generado. Ejecutá "npm run build" antes de iniciar.'));
}

// Arranque: escuchar en 0.0.0.0 para que el proxy de Railway pueda conectar
function main() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en 0.0.0.0:${PORT}`);
    console.log('Base de datos:', getDatabaseUrl() ? 'URL definida' : 'NO DEFINIDA (agregá DATABASE_URL en Railway)');
    initSchema().catch((err) => console.error('Error al inicializar esquema:', err.message));
  });
  server.on('error', (err) => {
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
  });
}

main();
