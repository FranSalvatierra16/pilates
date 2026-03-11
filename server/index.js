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
  const { rows: adminRows } = await db.query('SELECT id FROM admin WHERE usuario = $1', ['adminF']);
  if (adminRows.length === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '2401', 10);
    await db.query('INSERT INTO admin (id, usuario, clave_hash) VALUES ($1, $2, $3)', [crypto.randomUUID(), 'adminF', hash]);
    console.log('Cuenta admin creada (usuario: adminF).');
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
app.get('/api/alumnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const sid = req.user?.sucursalId;
    const { rows } = await db.query(
      'SELECT * FROM alumnos WHERE sucursal_id = $1 ORDER BY created_at DESC',
      [sid]
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
      clasesAsistidas: r.clases_asistidas ?? 0,
      descripcion: r.descripcion ?? '',
      linkToken: r.link_token ?? '',
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
      `INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, descripcion, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
    await db.query('DELETE FROM alumnos WHERE id = $1 AND sucursal_id = $2', [req.params.id, req.user.sucursalId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alumnos/findByDni', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM alumnos WHERE dni = $1 AND sucursal_id = $2', [req.query.dni, req.user.sucursalId]);
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
      clasesAsistidas: r.clases_asistidas ?? 0,
      descripcion: r.descripcion ?? '',
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
      'INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, created_at, descripcion, sucursal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [b.id, b.alumnoId || null, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString(), b.descripcion || null, sucursalId]
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
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
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
    await db.query(
      'INSERT INTO gastos (id, sucursal_id, descripcion, monto, metodo_pago, fecha, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [b.id, req.user.sucursalId, b.descripcion, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString()]
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
    await db.query(
      'INSERT INTO turnos (id, sucursal_id, dia_semana, hora, titulo, profesor_id, alumno_ids, cupo, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [b.id, req.user.sucursalId, b.diaSemana, b.hora, b.titulo || null, b.profesorId || null, b.alumnoIds || [], cupo, b.createdAt || new Date().toISOString()]
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
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Portal alumno (sin auth: solo sumarse o liberar cupo) ---
app.get('/api/alumno-portal', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const token = (req.query.token || '').toString().trim();
    if (!token) return res.status(400).json({ error: 'Faltó el token' });
    const { rows: alumnoRows } = await db.query('SELECT id, nombre, apellido, sucursal_id FROM alumnos WHERE link_token = $1', [token]);
    if (alumnoRows.length === 0) return res.status(404).json({ error: 'Link inválido o expirado' });
    const alumno = alumnoRows[0];
    const sucursalId = alumno.sucursal_id;
    const { rows: turnoRows } = await db.query('SELECT id, dia_semana, hora, titulo, alumno_ids, cupo FROM turnos WHERE sucursal_id = $1 ORDER BY dia_semana, hora', [sucursalId]);
    const turnos = turnoRows.map((r) => {
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
    res.json({
      alumno: { id: alumno.id, nombre: alumno.nombre, apellido: alumno.apellido },
      turnos,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alumno-portal/inscribir', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { token, turnoId } = req.body || {};
    if (!token || !turnoId) return res.status(400).json({ error: 'Faltan token o turnoId' });
    const { rows: alumnoRows } = await db.query('SELECT id, sucursal_id FROM alumnos WHERE link_token = $1', [token]);
    if (alumnoRows.length === 0) return res.status(404).json({ error: 'Link inválido' });
    const alumno = alumnoRows[0];
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
    const { token, turnoId } = req.body || {};
    if (!token || !turnoId) return res.status(400).json({ error: 'Faltan token o turnoId' });
    const { rows: alumnoRows } = await db.query('SELECT id, sucursal_id FROM alumnos WHERE link_token = $1', [token]);
    if (alumnoRows.length === 0) return res.status(404).json({ error: 'Link inválido' });
    const alumno = alumnoRows[0];
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
    console.warn('Push no enviado: faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en el servidor.');
    return;
  }
  const { rows } = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE sucursal_id = $1',
    [sucursalId]
  );
  if (rows.length === 0) {
    console.warn('Push no enviado: ningún dispositivo registrado para esta sucursal.');
    return;
  }
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 }
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
        console.warn('Push: suscripción expirada, eliminada.');
      } else {
        console.error('Push error:', err.statusCode || err.message, sub.endpoint?.slice(0, 50));
      }
    }
  }
  if (sent > 0) console.log('Push enviado a', sent, 'dispositivo(s):', payload.title);
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

// Auth login (contra la BDD)
app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ ok: false, error: 'Base de datos no configurada' });
    const { usuario, password } = req.body || {};
    if (!usuario || !password) return res.status(400).json({ ok: false, error: 'Faltan usuario o contraseña' });
    const u = usuario.trim();
    const isAdminUser = u === 'adminF';
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
        error: 'Cuenta admin no configurada en la base de datos. Ejecutá en el proyecto: npm run db:schema (con DATABASE_URL en .env o en Railway).',
      });
    }
    const { rows: sucRows } = await db.query('SELECT id, nombre_lugar, usuario, clave_hash, foto_perfil FROM sucursales WHERE usuario = $1', [u]);
    if (sucRows.length === 0) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    const valid = await bcrypt.compare(password, sucRows[0].clave_hash);
    if (!valid) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    const s = sucRows[0];
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
      `SELECT s.id, s.nombre_lugar, s.usuario, s.foto_perfil, s.created_at,
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
      'INSERT INTO sucursales (id, nombre_lugar, usuario, clave_hash, foto_perfil) VALUES ($1, $2, $3, $4, $5)',
      [id, (b.nombreLugar || b.nombre_lugar || '').trim(), (b.usuario || '').trim(), hash, b.fotoPerfil || b.foto_perfil || null]
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
