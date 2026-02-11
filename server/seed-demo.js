/**
 * Seed de prueba: 10 actividades, 100 alumnos aleatorios, profesores y turnos con alumnos asignados.
 * Ejecutar: node server/seed-demo.js
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

const NOMBRES = [
  'Francisco', 'María', 'Juan', 'Ana', 'Carlos', 'Lucía', 'Martín', 'Sofía', 'Diego', 'Valentina',
  'Javier', 'Camila', 'Luis', 'Victoria', 'Pablo', 'Emma', 'Andrés', 'Mía', 'Miguel', 'Isabella',
  'Ricardo', 'Luna', 'Fernando', 'Martina', 'Gonzalo', 'Sara', 'Emilio', 'Elena', 'Nicolás', 'Rocío',
  'Alejandro', 'Clara', 'Daniel', 'Julia', 'Gabriel', 'Lucía', 'Héctor', 'Adriana', 'Ignacio', 'Carla',
];
const APELLIDOS = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Fernández', 'Gómez', 'Díaz', 'Torres',
  'Ruiz', 'Hernández', 'Sánchez', 'Romero', 'Flores', 'Acosta', 'Benítez', 'Silva', 'Mendoza', 'Castro',
  'Vargas', 'Ríos', 'Suárez', 'Molina', 'Ortiz', 'Núñez', 'Cabrera', 'Ramos', 'Vega', 'Luna',
  'Ibarra', 'Maldonado', 'Ponce', 'Quiroga', 'Rojas', 'Salinas', 'Toledo', 'Uribe', 'Vera', 'Yáñez',
];

const ACTIVIDADES = [
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

const HORARIOS_MANANA = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
const HORARIOS_TARDE = ['16:00', '17:00', '18:00', '19:00', '20:00'];
const DIAS_SEMANA = 6; // Lunes a Sábado (0-5)

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL. Ejecutá con: DATABASE_URL=... node server/seed-demo.js');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    console.log('Iniciando seed de prueba...');

    // 1) Actividades (10)
    const actividadIds = [];
    for (let i = 0; i < ACTIVIDADES.length; i++) {
      const id = `act-demo-${i + 1}`;
      await client.query(
        `INSERT INTO actividades (id, nombre, precio) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nombre = $2, precio = $3`,
        [id, ACTIVIDADES[i].nombre, ACTIVIDADES[i].precio]
      );
      actividadIds.push(id);
    }
    console.log('✓ 10 actividades creadas/actualizadas');

    // 2) Profesores (2 si no hay)
    const { rows: profs } = await client.query('SELECT id FROM profesores LIMIT 2');
    const profesorIds = profs.map((r) => r.id);
    if (profesorIds.length < 2) {
      const nombres = ['Laura', 'Pedro'];
      const apellidos = ['Pilates', 'Instructor'];
      for (let i = profesorIds.length; i < 2; i++) {
        const id = `prof-demo-${i + 1}`;
        await client.query(
          'INSERT INTO profesores (id, nombre, apellido) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
          [id, nombres[i], apellidos[i]]
        );
        profesorIds.push(id);
      }
    }
    console.log('✓ Profesores listos:', profesorIds.length);

    // 3) 100 alumnos (DNI 90xxxxxx para no chocar con datos reales)
    const alumnoIds = [];
    for (let i = 0; i < 100; i++) {
      const id = crypto.randomUUID();
      const dni = `90${String(i).padStart(6, '0')}`;
      const nombre = randomItem(NOMBRES);
      const apellido = randomItem(APELLIDOS);
      const telefono = `223${String(randomInt(1000000, 9999999))}`;
      const email = `demo${i}+${nombre.toLowerCase()}@prueba.com`;
      const actividadId = randomItem(actividadIds);
      const fechaVenc = new Date();
      fechaVenc.setDate(fechaVenc.getDate() + randomInt(-10, 30));
      const fechaVencStr = fechaVenc.toISOString().slice(0, 10);

      await client.query(
        `INSERT INTO alumnos (id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW())
         ON CONFLICT (dni) DO NOTHING`,
        [id, nombre, apellido, dni, telefono, email, fechaVencStr, actividadId]
      );
      alumnoIds.push(id);
    }
    const { rows: alumnosRows } = await client.query("SELECT id FROM alumnos WHERE dni LIKE '90%'");
    const idsParaTurnos = alumnosRows.map((r) => r.id);
    if (idsParaTurnos.length === 0) {
      console.log('⚠ No hay alumnos con DNI 90xxxxxx. Creá al menos uno o revisá conflictos.');
    }
    console.log('✓ Alumnos de prueba disponibles para turnos:', idsParaTurnos.length);

    // 4) Turnos con alumnos asignados (Lun-Sáb, mañana y tarde)
    let turnosCreados = 0;
    const horarios = [...HORARIOS_MANANA, ...HORARIOS_TARDE];
    for (let dia = 0; dia < DIAS_SEMANA; dia++) {
      for (const hora of horarios) {
        const turnoId = crypto.randomUUID();
        const profesorId = randomItem(profesorIds);
        const cantidad = idsParaTurnos.length === 0 ? 0 : randomInt(3, Math.min(10, idsParaTurnos.length));
        const shuffled = [...idsParaTurnos].sort(() => Math.random() - 0.5);
        const asignados = cantidad === 0 ? [] : shuffled.slice(0, cantidad);

        await client.query(
          `INSERT INTO turnos (id, dia_semana, hora, titulo, profesor_id, alumno_ids, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [turnoId, dia, hora, `Clase ${hora}`, profesorId, asignados]
        );
        turnosCreados++;
      }
    }
    console.log('✓ Turnos creados:', turnosCreados);

    console.log('\nListo. Podés entrar a la app y ver 10 actividades, 100 alumnos y turnos con alumnos asignados.');
  } catch (err) {
    console.error('Error en el seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
