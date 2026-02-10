import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let pool = null;

async function getPool() {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL no definida. La API no tendrá base de datos.');
    return null;
  }
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

async function initSchema() {
  const db = await getPool();
  if (!db) return;
  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      await db.query(stmt + ';');
    }
    console.log('Esquema de base de datos listo.');
  } catch (err) {
    console.error('Error al inicializar esquema:', err.message);
  }
}

// --- Alumnos ---
app.get('/api/alumnos', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM alumnos ORDER BY created_at DESC');
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
    const b = req.body;
    await db.query(
      `INSERT INTO alumnos (id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        b.id,
        b.nombre,
        b.apellido,
        b.dni,
        b.telefono,
        b.email,
        b.fechaVencimientoCuota || null,
        b.actividadId || null,
        b.clasesAsistidas ?? 0,
        b.createdAt || new Date().toISOString(),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
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
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    await db.query(`UPDATE alumnos SET ${updates.join(', ')} WHERE id = $${i}`, values);
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
    await db.query('DELETE FROM alumnos WHERE id = $1', [req.params.id]);
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
    const { rows } = await db.query('SELECT * FROM alumnos WHERE dni = $1', [req.query.dni]);
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
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Actividades ---
app.get('/api/actividades', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM actividades ORDER BY created_at DESC');
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
    const { rows } = await db.query('SELECT * FROM actividades WHERE id = $1', [req.params.id]);
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
    const b = req.body;
    await db.query(
      'INSERT INTO actividades (id, nombre, precio, created_at) VALUES ($1, $2, $3, $4)',
      [b.id, b.nombre, b.precio, b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true });
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
    values.push(req.params.id);
    await db.query(`UPDATE actividades SET ${updates.join(', ')} WHERE id = $${i}`, values);
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
    await db.query('DELETE FROM actividades WHERE id = $1', [req.params.id]);
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
    const { rows } = await db.query('SELECT * FROM pagos ORDER BY created_at DESC');
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

app.get('/api/pagos/by-alumno/:alumnoId', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM pagos WHERE alumno_id = $1 ORDER BY created_at DESC', [req.params.alumnoId]);
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
    await db.query(
      'INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [b.id, b.alumnoId, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString()]
    );
    res.status(201).json({ ok: true });
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
    const { rows } = await db.query('SELECT * FROM gastos ORDER BY created_at DESC');
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
      'INSERT INTO gastos (id, descripcion, monto, metodo_pago, fecha, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [b.id, b.descripcion, b.monto, b.metodoPago, b.fecha, b.createdAt || new Date().toISOString()]
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
    values.push(req.params.id);
    await db.query(`UPDATE gastos SET ${updates.join(', ')} WHERE id = $${i}`, values);
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
    await db.query('DELETE FROM gastos WHERE id = $1', [req.params.id]);
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
    const { rows } = await db.query('SELECT * FROM profesores ORDER BY created_at DESC');
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
      'INSERT INTO profesores (id, nombre, apellido, created_at) VALUES ($1, $2, $3, $4)',
      [b.id, b.nombre, b.apellido, b.createdAt || new Date().toISOString()]
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
    values.push(req.params.id);
    await db.query(`UPDATE profesores SET ${updates.join(', ')} WHERE id = $${i}`, values);
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
    await db.query('DELETE FROM profesores WHERE id = $1', [req.params.id]);
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
    const { rows } = await db.query('SELECT * FROM turnos ORDER BY created_at DESC');
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
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
    await db.query(
      'INSERT INTO turnos (id, dia_semana, hora, titulo, profesor_id, alumno_ids, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [b.id, b.diaSemana, b.hora, b.titulo || null, b.profesorId || null, b.alumnoIds || [], b.createdAt || new Date().toISOString()]
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
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    await db.query(`UPDATE turnos SET ${updates.join(', ')} WHERE id = $${i}`, values);
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
    await db.query('DELETE FROM turnos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/turnos/by-dia/:diaSemana', async (req, res) => {
  try {
    const db = await getPool();
    if (!db) return res.status(503).json({ error: 'Base de datos no configurada' });
    const { rows } = await db.query('SELECT * FROM turnos WHERE dia_semana = $1', [req.params.diaSemana]);
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
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
    const { rows } = await db.query('SELECT * FROM turnos WHERE dia_semana = $1 AND hora = $2', [diaSemana, hora]);
    if (rows.length === 0) return res.json(null);
    const r = rows[0];
    res.json({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
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
    const { rows } = await db.query("SELECT * FROM turnos WHERE $1 = ANY(alumno_ids)", [req.params.alumnoId]);
    res.json(rows.map((r) => ({
      id: r.id,
      diaSemana: r.dia_semana,
      hora: r.hora,
      titulo: r.titulo || '',
      profesorId: r.profesor_id || '',
      alumnoIds: r.alumno_ids || [],
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
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
    const { rows } = await db.query('SELECT * FROM asistencias ORDER BY created_at DESC');
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
    const { rows } = await db.query('SELECT * FROM asistencias WHERE semana = $1', [req.params.semana]);
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

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, db: !!pool }));

// Servir frontend estático (después de build)
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// Arranque
async function main() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
