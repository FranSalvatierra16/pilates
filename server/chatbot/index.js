import express from 'express';
import { ESTADOS, ACCIONES_DNI } from './estados.js';
import {
  menuPrincipal,
  menuAlumno,
  pedirDni,
  textoConocerSavia,
  textoHablarProfesora,
  textoConsultaRecibida,
  textoOpcionInvalida,
} from './menu.js';
import {
  respuestaVencimiento,
  respuestaHorarios,
  respuestaCancelar,
  respuestaRecuperar,
  respuestaDniNoEncontrado,
  respuestaDniInvalido,
} from './respuestas.js';
import { obtenerOCrearSesion, actualizarSesion } from './sesiones.js';
import { buscarAlumnoPorDni, horariosFijosAlumno, normalizarDni } from '../services/alumnos.js';

const router = express.Router();

const LABELS_ACCION = {
  [ACCIONES_DNI.VENCIMIENTO]: 'ver tu vencimiento',
  [ACCIONES_DNI.CANCELAR]: 'cancelar / liberar una clase',
  [ACCIONES_DNI.RECUPERAR]: 'recuperar una clase',
  [ACCIONES_DNI.HORARIOS]: 'ver tus horarios',
};

function normalizarMensaje(mensaje) {
  return String(mensaje || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function esMenuOHola(msg) {
  const m = normalizarMensaje(msg);
  return (
    m === '' ||
    m === '0' ||
    m === 'menu' ||
    m === 'menú' ||
    m === 'hola' ||
    m === 'hi' ||
    m === 'buenas' ||
    m === 'buen dia' ||
    m === 'buena tarde' ||
    m === 'buena noche' ||
    m === 'inicio'
  );
}

async function irMenuPrincipal(telefono) {
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_PRINCIPAL,
    ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    contexto: {},
    mergeContexto: false,
  });
  return menuPrincipal();
}

async function irMenuAlumno(telefono) {
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_ALUMNO,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {},
    mergeContexto: false,
  });
  return menuAlumno();
}

async function pedirDniPara(telefono, accion) {
  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_DNI,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: { accionDni: accion },
    mergeContexto: false,
  });
  return pedirDni(LABELS_ACCION[accion] || 'continuar');
}

async function resolverAccionConAlumno(alumno, accion) {
  switch (accion) {
    case ACCIONES_DNI.VENCIMIENTO:
      return respuestaVencimiento(alumno);
    case ACCIONES_DNI.CANCELAR:
      return respuestaCancelar(alumno);
    case ACCIONES_DNI.RECUPERAR:
      return respuestaRecuperar(alumno);
    case ACCIONES_DNI.HORARIOS: {
      const turnos = await horariosFijosAlumno(alumno.id);
      return respuestaHorarios(alumno, turnos);
    }
    default:
      return menuAlumno();
  }
}

async function manejarMenuPrincipal(telefono, mensaje) {
  const m = String(mensaje || '').trim();

  if (m === '1') {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_PRINCIPAL,
      ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    });
    return textoConocerSavia();
  }

  if (m === '2') {
    return irMenuAlumno(telefono);
  }

  if (m === '3') {
    await actualizarSesion(telefono, {
      estado: ESTADOS.ESPERANDO_CONSULTA,
      ultimoMenu: ESTADOS.MENU_PRINCIPAL,
      contexto: { derivarProfesora: true },
      mergeContexto: false,
    });
    return textoHablarProfesora();
  }

  if (esMenuOHola(m) || m === '0') {
    return irMenuPrincipal(telefono);
  }

  // Texto libre desde el menú principal → lo tratamos como consulta
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_PRINCIPAL,
    ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    contexto: { ultimaConsulta: m },
  });
  return textoConsultaRecibida();
}

async function manejarMenuAlumno(telefono, mensaje) {
  const m = String(mensaje || '').trim();

  if (m === '0' || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }

  if (m === '1') return pedirDniPara(telefono, ACCIONES_DNI.VENCIMIENTO);
  if (m === '2') return pedirDniPara(telefono, ACCIONES_DNI.CANCELAR);
  if (m === '3') return pedirDniPara(telefono, ACCIONES_DNI.RECUPERAR);
  if (m === '4') return pedirDniPara(telefono, ACCIONES_DNI.HORARIOS);

  return textoOpcionInvalida(menuAlumno);
}

async function manejarEsperandoDni(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (m === '0') {
    return irMenuAlumno(telefono);
  }

  const dni = normalizarDni(m);
  if (!dni || dni.length < 6) {
    return respuestaDniInvalido();
  }

  const accion = sesion.contexto?.accionDni || ACCIONES_DNI.VENCIMIENTO;
  const alumno = await buscarAlumnoPorDni(dni);

  if (!alumno) {
    return respuestaDniNoEncontrado();
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_ALUMNO,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: alumno.id,
      dni: alumno.dni,
      ultimaAccion: accion,
    },
    mergeContexto: false,
  });

  return resolverAccionConAlumno(alumno, accion);
}

async function manejarEsperandoConsulta(telefono, mensaje) {
  const m = String(mensaje || '').trim();

  if (m === '0' || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_PRINCIPAL,
    contexto: { ultimaConsulta: m },
  });
  return textoConsultaRecibida();
}

/**
 * POST /api/chatbot
 * Body: { telefono, mensaje }
 * Response: { ok, reply, estado }
 */
router.post('/', async (req, res) => {
  try {
    const telefono = req.body?.telefono ?? req.body?.from ?? req.body?.phone;
    const mensaje = req.body?.mensaje ?? req.body?.message ?? req.body?.text ?? req.body?.body;

    if (!telefono) {
      return res.status(400).json({ ok: false, error: 'Falta telefono' });
    }

    console.log('[chatbot]', String(telefono).slice(-6), '|', String(mensaje || '').slice(0, 80));

    const sesion = await obtenerOCrearSesion(telefono);
    let reply;

    switch (sesion.estado) {
      case ESTADOS.MENU_ALUMNO:
        reply = await manejarMenuAlumno(telefono, mensaje);
        break;
      case ESTADOS.ESPERANDO_DNI:
        reply = await manejarEsperandoDni(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_CONSULTA:
        reply = await manejarEsperandoConsulta(telefono, mensaje);
        break;
      case ESTADOS.MENU_PRINCIPAL:
      default:
        reply = await manejarMenuPrincipal(telefono, mensaje);
        break;
    }

    const actualizada = await obtenerOCrearSesion(telefono);

    return res.json({
      ok: true,
      reply,
      estado: actualizada.estado,
    });
  } catch (e) {
    console.error('[chatbot]', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Error en el chatbot',
      reply: 'Hubo un problema técnico 😕 Probá de nuevo en unos segundos o escribí *menu*.',
    });
  }
});

export default router;
