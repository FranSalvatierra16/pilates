import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING
  );
}

function arg(n, fallback = '') {
  return (process.argv[n] || fallback).trim();
}

async function getColumnSet(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

function makeInsertSql(table, columns) {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
}

function nextUniqueDni(baseDni, usedDnis) {
  const trimmed = String(baseDni || '').trim();
  if (!trimmed) {
    let candidate = String(Date.now());
    while (usedDnis.has(candidate)) candidate = String(Number(candidate) + 1);
    usedDnis.add(candidate);
    return candidate;
  }

  if (/^\d+$/.test(trimmed)) {
    let candidate = String(Number(trimmed) + 1);
    while (usedDnis.has(candidate)) candidate = String(Number(candidate) + 1);
    usedDnis.add(candidate);
    return candidate;
  }

  let n = 1;
  let candidate = `${trimmed}-${n}`;
  while (usedDnis.has(candidate)) {
    n += 1;
    candidate = `${trimmed}-${n}`;
  }
  usedDnis.add(candidate);
  return candidate;
}

async function main() {
  const sourceUser = arg(2, 'Savia');
  const targetUser = arg(3, 'Savia2');
  const targetPassword = arg(4, '1234');
  const targetNombreLugar = arg(5, targetUser);

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL (o DATABASE_PUBLIC_URL / POSTGRES_URL).');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceSucursal = await client.query(
      `SELECT *
         FROM sucursales
        WHERE usuario = $1`,
      [sourceUser]
    );
    if (sourceSucursal.rows.length === 0) {
      throw new Error(`No existe una sucursal con usuario "${sourceUser}".`);
    }

    const targetSucursal = await client.query(
      `SELECT id
         FROM sucursales
        WHERE usuario = $1`,
      [targetUser]
    );
    if (targetSucursal.rows.length > 0) {
      throw new Error(`Ya existe una sucursal con usuario "${targetUser}".`);
    }

    const src = sourceSucursal.rows[0];
    const targetSucursalId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(targetPassword, 10);

    await client.query(
      `INSERT INTO sucursales (
        id, nombre_lugar, usuario, clave_hash, foto_perfil,
        pago_mensual, fecha_vencimiento_cuenta, activa,
        hora_inicio_manana, hora_fin_manana, hora_inicio_tarde, hora_fin_tarde
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        targetSucursalId,
        targetNombreLugar,
        targetUser,
        passwordHash,
        src.foto_perfil || null,
        src.pago_mensual ?? null,
        src.fecha_vencimiento_cuenta ?? null,
        src.activa ?? true,
        src.hora_inicio_manana || '07:00',
        src.hora_fin_manana || '12:00',
        src.hora_inicio_tarde || '16:00',
        src.hora_fin_tarde || '21:00',
      ]
    );

    const [alumnosCols, pagosCols, gastosCols, dniRows] = await Promise.all([
      getColumnSet(client, 'alumnos'),
      getColumnSet(client, 'pagos'),
      getColumnSet(client, 'gastos'),
      client.query(`SELECT dni FROM alumnos`),
    ]);
    const usedDnis = new Set(dniRows.rows.map((r) => String(r.dni || '').trim()).filter(Boolean));

    const actividadMap = new Map();
    const profesorMap = new Map();
    const alumnoMap = new Map();
    const turnoMap = new Map();

    const counters = {
      actividades: 0,
      profesores: 0,
      alumnos: 0,
      turnos: 0,
      pagos: 0,
      gastos: 0,
      registrosLink: 0,
      asistencias: 0,
      recuperaciones: 0,
      inscripcionesTurno: 0,
      notificaciones: 0,
    };

    const { rows: actividades } = await client.query(
      `SELECT *
         FROM actividades
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of actividades) {
      const id = crypto.randomUUID();
      actividadMap.set(row.id, id);
      await client.query(
        `INSERT INTO actividades (id, sucursal_id, nombre, precio, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, targetSucursalId, row.nombre, row.precio, row.created_at]
      );
      counters.actividades++;
    }

    const { rows: profesores } = await client.query(
      `SELECT *
         FROM profesores
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of profesores) {
      const id = crypto.randomUUID();
      profesorMap.set(row.id, id);
      await client.query(
        `INSERT INTO profesores (id, sucursal_id, nombre, apellido, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, targetSucursalId, row.nombre, row.apellido, row.created_at]
      );
      counters.profesores++;
    }

    const { rows: alumnos } = await client.query(
      `SELECT *
         FROM alumnos
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of alumnos) {
      const id = crypto.randomUUID();
      alumnoMap.set(row.id, id);

      const cols = [
        'id',
        'sucursal_id',
        'nombre',
        'apellido',
        'dni',
        'telefono',
        'email',
        'fecha_vencimiento_cuota',
        'actividad_id',
        'clases_asistidas',
      ];
      const vals = [
        id,
        targetSucursalId,
        row.nombre,
        row.apellido,
        nextUniqueDni(row.dni, usedDnis),
        row.telefono,
        row.email,
        row.fecha_vencimiento_cuota,
        row.actividad_id ? actividadMap.get(row.actividad_id) || null : null,
        row.clases_asistidas ?? 0,
      ];

      if (alumnosCols.has('descripcion')) {
        cols.push('descripcion');
        vals.push(row.descripcion ?? null);
      }
      if (alumnosCols.has('activo')) {
        cols.push('activo');
        vals.push(row.activo ?? true);
      }
      if (alumnosCols.has('created_at')) {
        cols.push('created_at');
        vals.push(row.created_at);
      }
      if (alumnosCols.has('link_token')) {
        cols.push('link_token');
        vals.push(row.link_token ? crypto.randomUUID() : null);
      }

      await client.query(makeInsertSql('alumnos', cols), vals);
      counters.alumnos++;
    }

    const { rows: turnos } = await client.query(
      `SELECT *
         FROM turnos
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of turnos) {
      const id = crypto.randomUUID();
      turnoMap.set(row.id, id);
      const alumnoIds = Array.isArray(row.alumno_ids)
        ? row.alumno_ids.map((oldId) => alumnoMap.get(oldId)).filter(Boolean)
        : [];
      await client.query(
        `INSERT INTO turnos (id, sucursal_id, dia_semana, hora, titulo, profesor_id, alumno_ids, cupo, destacado, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          targetSucursalId,
          row.dia_semana,
          row.hora,
          row.titulo ?? null,
          row.profesor_id ? profesorMap.get(row.profesor_id) || null : null,
          alumnoIds,
          row.cupo ?? 6,
          row.destacado ?? false,
          row.created_at,
        ]
      );
      counters.turnos++;
    }

    const { rows: pagos } = await client.query(
      `SELECT *
         FROM pagos
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of pagos) {
      const cols = [
        'id',
        'alumno_id',
        'monto',
        'metodo_pago',
        'fecha',
        'created_at',
        'sucursal_id',
      ];
      const vals = [
        crypto.randomUUID(),
        row.alumno_id ? alumnoMap.get(row.alumno_id) || null : null,
        row.monto,
        row.metodo_pago,
        row.fecha,
        row.created_at,
        targetSucursalId,
      ];
      if (pagosCols.has('descripcion')) {
        cols.splice(6, 0, 'descripcion');
        vals.splice(6, 0, row.descripcion ?? null);
      }
      if (pagosCols.has('hora')) {
        cols.push('hora');
        vals.push(row.hora ?? null);
      }
      await client.query(makeInsertSql('pagos', cols), vals);
      counters.pagos++;
    }

    const { rows: gastos } = await client.query(
      `SELECT *
         FROM gastos
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of gastos) {
      const cols = [
        'id',
        'sucursal_id',
        'descripcion',
        'monto',
        'metodo_pago',
        'fecha',
        'created_at',
      ];
      const vals = [
        crypto.randomUUID(),
        targetSucursalId,
        row.descripcion,
        row.monto,
        row.metodo_pago,
        row.fecha,
        row.created_at,
      ];
      if (gastosCols.has('hora')) {
        cols.push('hora');
        vals.push(row.hora ?? null);
      }
      if (gastosCols.has('profesor_id')) {
        cols.push('profesor_id');
        vals.push(row.profesor_id ? profesorMap.get(row.profesor_id) || null : null);
      }
      if (gastosCols.has('contabilizar_en_fecha')) {
        cols.push('contabilizar_en_fecha');
        vals.push(row.contabilizar_en_fecha ?? null);
      }
      await client.query(makeInsertSql('gastos', cols), vals);
      counters.gastos++;
    }

    const { rows: registrosLink } = await client.query(
      `SELECT *
         FROM registros_link
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of registrosLink) {
      await client.query(
        `INSERT INTO registros_link (id, sucursal_id, nombre, apellido, dni, telefono, email, actividad_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          crypto.randomUUID(),
          targetSucursalId,
          row.nombre,
          row.apellido,
          row.dni,
          row.telefono,
          row.email,
          row.actividad_id ? actividadMap.get(row.actividad_id) || null : null,
          row.created_at,
        ]
      );
      counters.registrosLink++;
    }

    const { rows: asistencias } = await client.query(
      `SELECT a.*
         FROM asistencias a
         JOIN turnos t ON t.id = a.turno_id
        WHERE t.sucursal_id = $1
        ORDER BY a.created_at, a.id`,
      [src.id]
    );
    for (const row of asistencias) {
      const turnoId = turnoMap.get(row.turno_id);
      const alumnoId = alumnoMap.get(row.alumno_id);
      if (!turnoId || !alumnoId) continue;
      await client.query(
        `INSERT INTO asistencias (id, turno_id, alumno_id, estado, semana, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [crypto.randomUUID(), turnoId, alumnoId, row.estado, row.semana, row.created_at]
      );
      counters.asistencias++;
    }

    const { rows: recuperaciones } = await client.query(
      `SELECT r.*
         FROM recuperaciones r
         JOIN turnos t ON t.id = r.turno_id
        WHERE t.sucursal_id = $1
        ORDER BY r.created_at, r.id`,
      [src.id]
    );
    for (const row of recuperaciones) {
      const turnoId = turnoMap.get(row.turno_id);
      const alumnoId = alumnoMap.get(row.alumno_id);
      if (!turnoId || !alumnoId) continue;
      await client.query(
        `INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), turnoId, alumnoId, row.semana, row.created_at]
      );
      counters.recuperaciones++;
    }

    const { rows: inscripciones } = await client.query(
      `SELECT i.*
         FROM inscripciones_turno i
         JOIN turnos t ON t.id = i.turno_id
        WHERE t.sucursal_id = $1
        ORDER BY i.created_at, i.id`,
      [src.id]
    );
    for (const row of inscripciones) {
      const turnoId = turnoMap.get(row.turno_id);
      const alumnoId = alumnoMap.get(row.alumno_id);
      if (!turnoId || !alumnoId) continue;
      await client.query(
        `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), turnoId, alumnoId, row.semana_desde, row.created_at]
      );
      counters.inscripcionesTurno++;
    }

    const { rows: notificaciones } = await client.query(
      `SELECT *
         FROM notificaciones
        WHERE sucursal_id = $1
        ORDER BY created_at, id`,
      [src.id]
    );
    for (const row of notificaciones) {
      const turnoId = turnoMap.get(row.turno_id);
      const alumnoId = alumnoMap.get(row.alumno_id);
      if (!turnoId || !alumnoId) continue;
      await client.query(
        `INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id, created_at, leido)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), targetSucursalId, row.tipo, alumnoId, turnoId, row.created_at, row.leido ?? false]
      );
      counters.notificaciones++;
    }

    await client.query('COMMIT');

    console.log(`Sucursal clonada: ${sourceUser} -> ${targetUser}`);
    console.log(`Usuario: ${targetUser}`);
    console.log(`Clave: ${targetPassword}`);
    console.log(`ID nueva sucursal: ${targetSucursalId}`);
    console.log('Copiados:', counters);
    console.log('No se copiaron push_subscriptions para evitar notificaciones duplicadas en dispositivos existentes.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al clonar sucursal:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
