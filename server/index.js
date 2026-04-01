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
      `INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, descripcion, activo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
    const getFechaFromSemanaYDia = (semana, diaSemana) => {
      const [y, w] = semana.split('-').map(Number);
      const jan1 = new Date(y, 0, 1);
      const dayOfJan1 = jan1.getDay();
      const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
      const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
      const d = new Date(mondayWeek1);
      d.setDate(d.getDate() + (w - 1) * 7 + diaSemana);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
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
    res.json(rows.map((r) => ({ id: r.id, nombre: r.nombre, precio: Number(r.precio), createdAt: r.created_at?.toISOString?.() ?? r.created_at })));
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
    res.json({ id: r.id, nombre: r.nombre, precio: Number(r.precio), createdAt: r.created_at?.toISOString?.() ?? r.created_at });
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
      'INSERT INTO actividades (id, sucursal_id, nombre, precio, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, sid, (b.nombre || '').trim(), Number(b.precio) || 0, b.createdAt || new Date().toISOString()]
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
    res.json(rows.map((r) => ({
      id: r.id,
      alumnoId: r.alumno_id ?? null,
      monto: Number(r.monto),
      metodoPago: r.metodo_pago,
      fecha: r.fecha?.toISOString?.()?.slice(0, 10) ?? r.fecha,
      hora: r.hora ? String(r.hora).slice(0, 5) : '12:00',
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      descripcion: r.descripcion ?? undefined,
    })));
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
    res.json(rows.map((r) => ({
      id: r.id,
      alumnoId: r.alumno_id,
      monto: Number(r.monto),
      metodoPago: r.metodo_pago,
      fecha: r.fecha?.toISOString?.()?.slice(0, 10) ?? r.fecha,
      hora: r.hora ? String(r.hora).slice(0, 5) : '12:00',
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
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
      'INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, hora, created_at, descripcion, sucursal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        b.id,
        b.alumnoId || null,
        b.monto,
        b.metodoPago,
        b.fecha,
        b.hora || '12:00',
        b.createdAt || new Date().toISOString(),
        b.descripcion || null,
        sucursalId,
      ]
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
    res.json(rows.map((r) => ({
      id: r.id,
      descripcion: r.descripcion,
      monto: Number(r.monto),
      metodoPago: r.metodo_pago,
      fecha: r.fecha?.toISOString?.()?.slice(0, 10) ?? r.fecha,
      hora: r.hora ? String(r.hora).slice(0, 5) : '12:00',
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      ...(r.profesor_id != null && { profesorId: r.profesor_id }),
      ...(r.contabilizar_en_fecha != null && {
        contabilizarEnFecha:
          r.contabilizar_en_fecha instanceof Date
            ? r.contabilizar_en_fecha.toISOString().slice(0, 10)
            : String(r.contabilizar_en_fecha).slice(0, 10),
      }),
    })));
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
    let profesorId = b.profesorId ?? null;
    if (profesorId) {
      const { rows: pr } = await db.query(
        'SELECT id FROM profesores WHERE id = $1 AND sucursal_id = $2',
        [profesorId, req.user.sucursalId]
      );
      if (pr.length === 0) {
        return res.status(400).json({ error: 'Profesor inválido para esta sucursal' });
      }
    }
    const contabilizarEn = b.contabilizarEnFecha ?? null;
    await db.query(
      'INSERT INTO gastos (id, sucursal_id, descripcion, monto, metodo_pago, fecha, hora, created_at, profesor_id, contabilizar_en_fecha) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        b.id,
        req.user.sucursalId,
        b.descripcion,
        b.monto,
        b.metodoPago,
        b.fecha,
        b.hora || '12:00',
        b.createdAt || new Date().toISOString(),
        profesorId,
        contabilizarEn,
      ]
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
    if (b.hora !== undefined) { updates.push(`hora = $${i++}`); values.push(b.hora || '12:00'); }
    if (b.profesorId !== undefined) {
      let pid = b.profesorId;
      if (pid) {
        const { rows: pr } = await db.query(
          'SELECT id FROM profesores WHERE id = $1 AND sucursal_id = $2',
          [pid, req.user.sucursalId]
        );
        if (pr.length === 0) {
          return res.status(400).json({ error: 'Profesor inválido para esta sucursal' });
        }
      }
      updates.push(`profesor_id = $${i++}`);
      values.push(pid || null);
    }
    if (b.contabilizarEnFecha !== undefined) {
      updates.push(`contabilizar_en_fecha = $${i++}`);
      values.push(b.contabilizarEnFecha || null);
    }
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

function instanteLocalMs(fecha, hora) {
  const fd = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const h = hora && String(hora).trim() ? String(hora).trim() : '12:00';
  const m = h.match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : 12;
  const mm = m ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
  const [y, mo, d] = fd.split('-').map(Number);
  return new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
}

function combinarFechaHoraISO(fechaStr, horaStr) {
  return new Date(instanteLocalMs(fechaStr, horaStr)).toISOString();
}

function instanteCierreRow(r) {
  if (r.cerrado_en != null) {
    const d = r.cerrado_en instanceof Date ? r.cerrado_en : new Date(r.cerrado_en);
    return d.getTime();
  }
  const fc =
    r.fecha_cierre?.toISOString?.()?.slice(0, 10) ??
    r.fecha_hasta?.toISOString?.()?.slice(0, 10) ??
    String(r.fecha_cierre ?? r.fecha_hasta ?? '').slice(0, 10);
  if (!fc) return 0;
  return instanteLocalMs(fc, '12:00');
}

function mapCierreCajaRow(r) {
  const fc =
    r.fecha_cierre?.toISOString?.()?.slice(0, 10) ??
    r.fecha_cierre ??
    r.fecha_hasta?.toISOString?.()?.slice(0, 10) ??
    r.fecha_hasta;
  return {
    id: r.id,
    descripcion: r.descripcion,
    fechaCierre: fc,
    ...(r.cerrado_en != null && {
      cerradoEn:
        r.cerrado_en instanceof Date ? r.cerrado_en.toISOString() : String(r.cerrado_en),
    }),
    montoRetirado: Number(r.monto_retirado ?? 0),
    saldoAntesRetiro: r.saldo_antes_retiro != null ? Number(r.saldo_antes_retiro) : undefined,
    saldoDespuesRetiro: r.saldo_despues_retiro != null ? Number(r.saldo_despues_retiro) : undefined,
    fechaDesde: r.fecha_desde?.toISOString?.()?.slice(0, 10) ?? r.fecha_desde,
    fechaHasta: r.fecha_hasta?.toISOString?.()?.slice(0, 10) ?? r.fecha_hasta,
    ingresosEfectivo: Number(r.ingresos_efectivo ?? 0),
    ingresosTransferencia: Number(r.ingresos_transferencia ?? 0),
    gastosEfectivo: Number(r.gastos_efectivo ?? 0),
    gastosTransferencia: Number(r.gastos_transferencia ?? 0),
    totalIngresos: Number(r.total_ingresos ?? 0),
    totalGastos: Number(r.total_gastos ?? 0),
    neto: Number(r.neto ?? 0),
    movimientosCount: Number(r.movimientos_count ?? 0),
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

async function getTeoricoNetoCaja(db, sucursalId) {
  const { rows: pi } = await db.query(
    `SELECT COALESCE(SUM(p.monto), 0) AS s FROM pagos p
     LEFT JOIN alumnos a ON p.alumno_id = a.id
     WHERE a.sucursal_id = $1 OR (p.alumno_id IS NULL AND p.sucursal_id = $1)`,
    [sucursalId]
  );
  const { rows: gi } = await db.query('SELECT COALESCE(SUM(monto), 0) AS s FROM gastos WHERE sucursal_id = $1', [sucursalId]);
  return Number(pi[0].s) - Number(gi[0].s);
}

// --- Cierres de caja ---
app.get('/api/cierres-caja', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query(
      `SELECT * FROM cierres_caja WHERE sucursal_id = $1
       ORDER BY cerrado_en DESC NULLS LAST, COALESCE(fecha_cierre, fecha_hasta) DESC NULLS LAST, created_at DESC`,
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
    const { rows } = await db.query('SELECT * FROM cierres_caja WHERE id = $1 AND sucursal_id = $2', [
      req.params.id,
      req.user.sucursalId,
    ]);
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
    const fechaCierre = String(b.fecha || b.fechaCierre || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const horaCierreRaw = b.horaCierre ?? b.hora ?? '12:00';
    const horaCierre = String(horaCierreRaw).trim() || '12:00';
    const cerradoEnBody = b.cerradoEn != null ? String(b.cerradoEn).trim() : '';
    const montoRetirado = Number(b.montoRetirado);
    if (!descripcion) return res.status(400).json({ error: 'Nombre o descripción requerida' });
    if (!Number.isFinite(montoRetirado) || montoRetirado < 0) return res.status(400).json({ error: 'Indicá un monto a retirar válido (≥ 0)' });

    const sid = req.user.sucursalId;
    let cerradoMs = instanteLocalMs(fechaCierre, horaCierre);
    if (cerradoEnBody) {
      const t = new Date(cerradoEnBody).getTime();
      if (!Number.isFinite(t)) return res.status(400).json({ error: 'cerradoEn inválido' });
      cerradoMs = t;
    }
    const cerradoEn = new Date(cerradoMs).toISOString();

    const teorico = await getTeoricoNetoCaja(db, sid);
    const { rows: retRows } = await db.query(
      'SELECT COALESCE(SUM(monto_retirado), 0) AS s FROM cierres_caja WHERE sucursal_id = $1',
      [sid]
    );
    const sumRetirosPrev = Number(retRows[0].s);
    const saldoAntesRetiro = teorico - sumRetirosPrev;
    const saldoDespuesRetiro = saldoAntesRetiro - montoRetirado;

    const { rows: lastCierreRows } = await db.query(
      `SELECT * FROM cierres_caja WHERE sucursal_id = $1
       ORDER BY cerrado_en DESC NULLS LAST, COALESCE(fecha_cierre, fecha_hasta) DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [sid]
    );
    const prevInstant = lastCierreRows[0] ? instanteCierreRow(lastCierreRows[0]) : null;

    const { rows: pagRows } = await db.query(
      `SELECT p.* FROM pagos p
       LEFT JOIN alumnos a ON p.alumno_id = a.id
       WHERE a.sucursal_id = $1 OR (p.alumno_id IS NULL AND p.sucursal_id = $1)`,
      [sid]
    );
    const { rows: gasRowsAll } = await db.query('SELECT * FROM gastos WHERE sucursal_id = $1', [sid]);

    const pagFil = [];
    for (const r of pagRows) {
      const t = instanteLocalMs(r.fecha, r.hora);
      if (prevInstant != null && t <= prevInstant) continue;
      if (t > cerradoMs) continue;
      pagFil.push(r);
    }
    const gasFil = [];
    for (const r of gasRowsAll) {
      const t = instanteLocalMs(r.fecha, r.hora);
      if (prevInstant != null && t <= prevInstant) continue;
      if (t > cerradoMs) continue;
      gasFil.push(r);
    }

    let ingEf = 0;
    let ingTr = 0;
    for (const r of pagFil) {
      const m = Number(r.monto);
      if (r.metodo_pago === 'efectivo') ingEf += m;
      else ingTr += m;
    }
    let gasEf = 0;
    let gasTr = 0;
    for (const r of gasFil) {
      const m = Number(r.monto);
      if (r.metodo_pago === 'efectivo') gasEf += m;
      else gasTr += m;
    }

    const totalIngresos = ingEf + ingTr;
    const totalGastos = gasEf + gasTr;
    const balanceSesion = totalIngresos - totalGastos;
    const movimientosCount = pagFil.length + gasFil.length;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.query(
      `INSERT INTO cierres_caja (
        id, sucursal_id, descripcion, fecha_desde, fecha_hasta, fecha_cierre,
        ingresos_efectivo, ingresos_transferencia, gastos_efectivo, gastos_transferencia,
        total_ingresos, total_gastos, neto, movimientos_count,
        monto_retirado, saldo_antes_retiro, saldo_despues_retiro, cerrado_en, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        id,
        sid,
        descripcion,
        fechaCierre,
        fechaCierre,
        fechaCierre,
        ingEf,
        ingTr,
        gasEf,
        gasTr,
        totalIngresos,
        totalGastos,
        balanceSesion,
        movimientosCount,
        montoRetirado,
        saldoAntesRetiro,
        saldoDespuesRetiro,
        cerradoEn,
        createdAt,
      ]
    );

    res.status(201).json(
      mapCierreCajaRow({
        id,
        descripcion,
        fecha_cierre: fechaCierre,
        cerrado_en: cerradoEn,
        fecha_desde: fechaCierre,
        fecha_hasta: fechaCierre,
        ingresos_efectivo: ingEf,
        ingresos_transferencia: ingTr,
        gastos_efectivo: gasEf,
        gastos_transferencia: gasTr,
        total_ingresos: totalIngresos,
        total_gastos: totalGastos,
        neto: balanceSesion,
        movimientos_count: movimientosCount,
        monto_retirado: montoRetirado,
        saldo_antes_retiro: saldoAntesRetiro,
        saldo_despues_retiro: saldoDespuesRetiro,
        created_at: createdAt,
      })
    );
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

app.get('/api/sucursal/horarios', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    if (!sid) return res.status(403).json({ error: 'Acceso de sucursal requerido' });
    const { rows } = await db.query(
      'SELECT hora_inicio_manana, hora_fin_manana, hora_inicio_tarde, hora_fin_tarde FROM sucursales WHERE id = $1',
      [sid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
    const r = rows[0];
    const manana = generarHorasDesdeHasta(r.hora_inicio_manana || '07:00', r.hora_fin_manana || '12:00');
    const tarde = generarHorasDesdeHasta(r.hora_inicio_tarde || '16:00', r.hora_fin_tarde || '21:00');
    res.json({
      horaInicioManana: r.hora_inicio_manana || '07:00',
      horaFinManana: r.hora_fin_manana || '12:00',
      horaInicioTarde: r.hora_inicio_tarde || '16:00',
      horaFinTarde: r.hora_fin_tarde || '21:00',
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
// Resuelve alumno por token o por dni (+ sucursalId opcional). Retorna { alumno, sucursalId } o error.
async function resolveAlumnoPortal(db, { token, dni, sucursalId }) {
  if (token && token.trim()) {
    const { rows } = await db.query('SELECT id, nombre, apellido, sucursal_id FROM alumnos WHERE link_token = $1 AND activo IS DISTINCT FROM false', [token.trim()]);
    if (rows.length === 0) return { error: 404, message: 'Link inválido o expirado' };
    return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  }
  const dniTrim = (dni || '').toString().trim();
  if (!dniTrim) return { error: 400, message: 'Ingresá tu DNI' };
  if (sucursalId && sucursalId.trim()) {
    const { rows } = await db.query('SELECT id, nombre, apellido, sucursal_id FROM alumnos WHERE dni = $1 AND sucursal_id = $2 AND activo IS DISTINCT FROM false', [dniTrim, sucursalId.trim()]);
    if (rows.length === 0) return { error: 404, message: 'No encontramos un alumno con ese DNI en esta sede' };
    return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  }
  const { rows } = await db.query('SELECT id, nombre, apellido, sucursal_id FROM alumnos WHERE dni = $1 AND activo IS DISTINCT FROM false', [dniTrim]);
  if (rows.length === 0) return { error: 404, message: 'No encontramos un alumno con ese DNI' };
  if (rows.length === 1) return { alumno: rows[0], sucursalId: rows[0].sucursal_id };
  const { rows: sucursales } = await db.query(
    'SELECT s.id, s.nombre_lugar FROM sucursales s WHERE s.id = ANY($1)',
    [rows.map((r) => r.sucursal_id)]
  );
  return { error: 400, sucursales, message: 'Hay varias sedes con ese DNI. Elegí tu sede.' };
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
    const { rows: horRows } = await db.query(
      'SELECT hora_inicio_manana, hora_fin_manana, hora_inicio_tarde, hora_fin_tarde FROM sucursales WHERE id = $1',
      [sid]
    );
    const hor = horRows[0] || {};
    let turnos;
    if (esRecuperar && semanaVista) {
      const { rows: recRows } = await db.query(
        'SELECT id, turno_id FROM recuperaciones WHERE alumno_id = $1 AND semana = $2',
        [alumno.id, semanaVista]
      );
      const { rows: recCountRows } = await db.query(
        'SELECT turno_id, COUNT(*) AS n FROM recuperaciones WHERE turno_id = ANY($1) AND semana = $2 GROUP BY turno_id',
        [turnoRows.map((r) => r.id), semanaVista]
      );
      const recByTurno = new Map(recRows.map((r) => [r.turno_id, r]));
      const recCountByTurno = new Map(recCountRows.map((r) => [r.turno_id, parseInt(r.n, 10)]));
      turnos = turnoRows.map((r) => {
        const alumnoIds = r.alumno_ids || [];
        const cupo = r.cupo != null ? Number(r.cupo) : 6;
        const rec = recByTurno.get(r.id);
        const recCount = recCountByTurno.get(r.id) || 0;
        const inscriptos = alumnoIds.length + recCount;
        return {
          id: r.id,
          diaSemana: r.dia_semana,
          hora: r.hora,
          titulo: r.titulo || '',
          cupo,
          inscriptos,
          yaInscripto: !!rec,
          ...(rec && { recuperacionId: rec.id }),
        };
      });
    } else {
      turnos = turnoRows.map((r) => {
        const alumnoIds = r.alumno_ids || [];
        const cupo = r.cupo != null ? Number(r.cupo) : 6;
        return {
          id: r.id,
          diaSemana: r.dia_semana,
          hora: r.hora,
          titulo: r.titulo || '',
          cupo,
          inscriptos: alumnoIds.length,
          yaInscripto: alumnoIds.includes(alumno.id),
        };
      });
    }
    const payload = {
      alumno: { id: alumno.id, nombre: alumno.nombre, apellido: alumno.apellido },
      turnos,
      sucursalId: sid,
      modo: esRecuperar ? 'recuperar' : 'fijo',
      ...(esRecuperar && semanaVista && { semanaVista }),
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
    const semanaVista = (semana || '').toString().trim() || getSemanaActual();
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids, cupo FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const { rows: exist } = await db.query(
      'SELECT id FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
      [alumno.id, turnoId, semanaVista]
    );
    if (exist.length > 0) return res.json({ ok: true, message: 'Ya estás anotado para recuperar esta semana' });
    const t = turnoRows[0];
    const cupo = t.cupo != null ? Number(t.cupo) : 6;
    const { rows: recCount } = await db.query('SELECT COUNT(*) AS n FROM recuperaciones WHERE turno_id = $1 AND semana = $2', [turnoId, semanaVista]);
    const totalFijos = (t.alumno_ids || []).length;
    const recs = parseInt(recCount[0]?.n || '0', 10);
    if (totalFijos + recs >= cupo) return res.status(400).json({ error: 'No hay cupo para recuperar esta semana' });
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id, turnoId, alumno.id, semanaVista]
    );
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
      await sendPushToSucursal(db, alumno.sucursal_id, {
        title: 'Recuperación: nueva anotación',
        body: `${nombre} se anotó para recuperar en ${turno}`,
      });
    }
    res.json({ ok: true, recuperacionId: id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
    if (recuperacionId) {
      const { rows: recRow } = await db.query('SELECT turno_id FROM recuperaciones WHERE id = $1 AND alumno_id = $2', [recuperacionId, alumno.id]);
      if (recRow.length > 0) turnoIdParaPush = recRow[0].turno_id;
      const { rowCount } = await db.query(
        'DELETE FROM recuperaciones WHERE id = $1 AND alumno_id = $2',
        [recuperacionId, alumno.id]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Recuperación no encontrada' });
    } else if (turnoId) {
      const semana = (semanaBody || '').toString().trim() || getSemanaActual();
      const { rowCount } = await db.query(
        'DELETE FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
        [alumno.id, turnoId, semana]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'No estabas anotado para recuperar' });
    } else {
      return res.status(400).json({ error: 'Falta turnoId o recuperacionId' });
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
        await sendPushToSucursal(db, alumno.sucursal_id, {
          title: 'Recuperación: cupo liberado',
          body: `${nombre} liberó recuperación en ${turno}`,
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids, cupo FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const t = turnoRows[0];
    const ids = t.alumno_ids || [];
    const cupo = t.cupo != null ? Number(t.cupo) : 6;
    if (ids.includes(alumno.id)) return res.json({ ok: true, message: 'Ya estabas inscripto' });
    if (ids.length >= cupo) return res.status(400).json({ error: 'No hay cupo disponible' });
    const nuevosIds = [...ids, alumno.id];
    await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [nuevosIds, turnoId, alumno.sucursal_id]);
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
      await sendPushToSucursal(db, alumno.sucursal_id, {
        title: 'Nueva anotación',
        body: `${nombre} se anotó en ${turno}`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
    const { rows: turnoRows } = await db.query('SELECT id, alumno_ids FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, alumno.sucursal_id]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
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
      await sendPushToSucursal(db, alumno.sucursal_id, {
        title: 'Cupo liberado',
        body: `${nombre} liberó cupo en ${turno}`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
    res.json({ ok: true });
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
      'INSERT INTO asistencias (id, turno_id, alumno_id, estado, semana, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [b.id, b.turnoId, b.alumnoId, b.estado || null, b.semana, b.createdAt || new Date().toISOString()]
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
      `SELECT r.id, r.turno_id AS "turnoId", r.alumno_id AS "alumnoId", r.semana, r.created_at AS "createdAt"
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
    const { turnoId, alumnoId, semana } = req.body || {};
    if (!turnoId || !alumnoId || !semana) return res.status(400).json({ error: 'Faltan turnoId, alumnoId o semana' });
    const { rows: turnoRows } = await db.query('SELECT id FROM turnos WHERE id = $1 AND sucursal_id = $2', [turnoId, sid]);
    if (turnoRows.length === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    const id = crypto.randomUUID();
    await db.query(
      'INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id, turnoId, alumnoId, semana]
    );
    res.status(201).json({ id, turnoId, alumnoId, semana, createdAt: new Date().toISOString() });
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
        s.hora_inicio_manana, s.hora_fin_manana, s.hora_inicio_tarde, s.hora_fin_tarde, s.created_at,
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

// Manifest PWA dinámico: nombre e icono según el usuario (brand=fitgest → FITGEST + fitgest.png)
app.get('/api/manifest.webmanifest', (req, res) => {
  const brand = (req.query.brand || '').toString().trim().toLowerCase().replace(/\s+/g, '') || 'savia';
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);
  const icon = ['fitgest', 'savia'].includes(brand) ? `/${brand}.png` : '/savia.png';
  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-store');
  res.json({
    name: `${name} - Sistema de Gestión`,
    short_name: name,
    description: 'Sistema de gestión para Pilates',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    icons: [
      { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
});

// Servir frontend estático (después de build)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
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
