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
  respuestaDniNoEncontrado,
  respuestaDniInvalido,
  listaLiberarClases,
  respuestaLiberacionOk,
  respuestaLiberacionYaHecha,
  listaRecuperarClases,
  respuestaRecuperacionOk,
  respuestaRecuperacionYaHecha,
  lineasOpciones,
} from './respuestas.js';
import { obtenerOCrearSesion, actualizarSesion } from './sesiones.js';
import { buscarAlumnoPorDni, horariosFijosAlumno, normalizarDni } from '../services/alumnos.js';
import {
  listarClasesParaLiberar,
  liberarClaseFija,
  listarClasesParaRecuperar,
  anotarRecuperacion,
} from '../services/turnos.js';

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

function identidadGuardada(contexto = {}) {
  const dni = normalizarDni(contexto.dni);
  if (dni && dni.length >= 6) return { dni, alumnoId: contexto.alumnoId || null };
  return null;
}

async function irMenuPrincipal(telefono, { resetIdentidad = false } = {}) {
  const sesion = await obtenerOCrearSesion(telefono);
  const identidad = resetIdentidad ? null : identidadGuardada(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_PRINCIPAL,
    ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    contexto: identidad ? { dni: identidad.dni, alumnoId: identidad.alumnoId } : {},
    mergeContexto: false,
  });
  return menuPrincipal();
}

async function irMenuAlumno(telefono) {
  const sesion = await obtenerOCrearSesion(telefono);
  const identidad = identidadGuardada(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_ALUMNO,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: identidad ? { dni: identidad.dni, alumnoId: identidad.alumnoId } : {},
    mergeContexto: false,
  });
  return menuAlumno();
}

async function pedirDniPara(telefono, accion, sesion) {
  const identidad = identidadGuardada(sesion?.contexto);
  if (identidad) {
    const alumno = await buscarAlumnoPorDni(identidad.dni);
    if (alumno) {
      await actualizarSesion(telefono, {
        estado: ESTADOS.MENU_ALUMNO,
        ultimoMenu: ESTADOS.MENU_ALUMNO,
        contexto: {
          alumnoId: alumno.id,
          dni: normalizarDni(alumno.dni) || identidad.dni,
          ultimaAccion: accion,
        },
        mergeContexto: false,
      });
      return resolverAccionConAlumno(telefono, alumno, accion);
    }
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_DNI,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      accionDni: accion,
      ...(identidad ? { dni: identidad.dni, alumnoId: identidad.alumnoId } : {}),
    },
    mergeContexto: false,
  });
  return pedirDni(LABELS_ACCION[accion] || 'continuar');
}

async function iniciarLiberarClases(telefono, alumno) {
  const { opciones } = await listarClasesParaLiberar(alumno);
  const { texto, opciones: liberables } = listaLiberarClases(alumno, opciones);

  if (!liberables.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni),
      },
      mergeContexto: false,
    });
    return texto;
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_LIBERAR,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: alumno.id,
      dni: normalizarDni(alumno.dni),
      opcionesLiberar: liberables.map((o) => ({
        turnoId: o.turnoId,
        semana: o.semana,
        label: o.label,
      })),
    },
    mergeContexto: false,
  });
  return texto;
}

async function iniciarRecuperarClases(telefono, alumno) {
  const { opciones, creditos } = await listarClasesParaRecuperar(alumno);
  const { texto, opciones: recuperables } = listaRecuperarClases(alumno, opciones, creditos);

  if (!recuperables.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni),
      },
      mergeContexto: false,
    });
    return texto;
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_RECUPERAR,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: alumno.id,
      dni: normalizarDni(alumno.dni),
      opcionesRecuperar: recuperables.map((o) => ({
        turnoId: o.turnoId,
        semana: o.semana,
        label: o.label,
      })),
    },
    mergeContexto: false,
  });
  return texto;
}

async function resolverAccionConAlumno(telefono, alumno, accion) {
  switch (accion) {
    case ACCIONES_DNI.VENCIMIENTO:
      return respuestaVencimiento(alumno);
    case ACCIONES_DNI.CANCELAR:
      return iniciarLiberarClases(telefono, alumno);
    case ACCIONES_DNI.RECUPERAR:
      return iniciarRecuperarClases(telefono, alumno);
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

async function manejarMenuAlumno(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  const mNorm = normalizarMensaje(m);

  if (m === '0') {
    return irMenuPrincipal(telefono);
  }

  // "menu" / "hola" reinician todo, incluido el DNI guardado
  if (mNorm === 'menu' || mNorm === 'menú' || mNorm === 'inicio') {
    return irMenuPrincipal(telefono, { resetIdentidad: true });
  }
  if (esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }

  // Escribir otro DNI desde el menú alumno cambia la identidad guardada
  const posibleDni = normalizarDni(m);
  if (posibleDni.length >= 6 && /^\d+$/.test(m.replace(/[.\s-]/g, ''))) {
    const alumno = await buscarAlumnoPorDni(posibleDni);
    if (alumno) {
      await actualizarSesion(telefono, {
        estado: ESTADOS.MENU_ALUMNO,
        ultimoMenu: ESTADOS.MENU_ALUMNO,
        contexto: {
          alumnoId: alumno.id,
          dni: normalizarDni(alumno.dni) || posibleDni,
        },
        mergeContexto: false,
      });
      return `✅ Listo, te reconocí como *${alumno.nombre} ${alumno.apellido}*.

${menuAlumno()}`;
    }
  }

  if (m === '1') return pedirDniPara(telefono, ACCIONES_DNI.VENCIMIENTO, sesion);
  if (m === '2') return pedirDniPara(telefono, ACCIONES_DNI.CANCELAR, sesion);
  if (m === '3') return pedirDniPara(telefono, ACCIONES_DNI.RECUPERAR, sesion);
  if (m === '4') return pedirDniPara(telefono, ACCIONES_DNI.HORARIOS, sesion);

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
      dni: normalizarDni(alumno.dni) || dni,
      ultimaAccion: accion,
    },
    mergeContexto: false,
  });

  return resolverAccionConAlumno(telefono, alumno, accion);
}

async function manejarEsperandoLiberar(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (m === '0' || esMenuOHola(m) || normalizarMensaje(m).startsWith('hola')) {
    return irMenuAlumno(telefono);
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesLiberar) ? sesion.contexto.opcionesLiberar : [];
  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    return `Elegí un número de la lista:\n\n${lineasOpciones(opciones)}\n\n0️⃣ Cancelar`;
  }

  const opcion = opciones[n - 1];
  const dni = sesion.contexto?.dni;
  const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
  if (!alumno) {
    return irMenuAlumno(telefono);
  }

  try {
    const result = await liberarClaseFija(alumno, opcion.turnoId, opcion.semana);
    const alumnoFresh = await buscarAlumnoPorDni(dni);
    const creditos = Number(alumnoFresh?.clases_para_recuperar ?? alumno.clases_para_recuperar) || 0;

    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni) || dni,
      },
      mergeContexto: false,
    });

    if (result.yaEstaba) return respuestaLiberacionYaHecha(opcion);
    return respuestaLiberacionOk(alumno, opcion, creditos);
  } catch (e) {
    console.error('[chatbot liberar]', e);
    return `${e.message || 'No se pudo liberar la clase.'}\n\n0️⃣ Volver`;
  }
}

async function manejarEsperandoRecuperar(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (m === '0' || esMenuOHola(m) || normalizarMensaje(m).startsWith('hola')) {
    return irMenuAlumno(telefono);
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesRecuperar) ? sesion.contexto.opcionesRecuperar : [];
  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    return `Elegí un número de la lista:\n\n${lineasOpciones(opciones)}\n\n0️⃣ Cancelar`;
  }

  const opcion = opciones[n - 1];
  const dni = sesion.contexto?.dni;
  const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
  if (!alumno) {
    return irMenuAlumno(telefono);
  }

  try {
    const result = await anotarRecuperacion(alumno, opcion.turnoId, opcion.semana);
    const alumnoFresh = await buscarAlumnoPorDni(dni);
    const creditos = Number(alumnoFresh?.clases_para_recuperar ?? 0) || 0;

    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni) || dni,
      },
      mergeContexto: false,
    });

    if (result.yaEstaba) return respuestaRecuperacionYaHecha(opcion);
    return respuestaRecuperacionOk(alumno, opcion, creditos);
  } catch (e) {
    console.error('[chatbot recuperar]', e);
    return `${e.message || 'No se pudo anotar la recuperación.'}\n\n0️⃣ Volver`;
  }
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
        reply = await manejarMenuAlumno(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_DNI:
        reply = await manejarEsperandoDni(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_LIBERAR:
        reply = await manejarEsperandoLiberar(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_RECUPERAR:
        reply = await manejarEsperandoRecuperar(telefono, mensaje, sesion);
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
