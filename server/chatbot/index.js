import express from 'express';
import { ESTADOS, ACCIONES_DNI } from './estados.js';
import {
  menuPrincipal,
  menuAlumno,
  menuNuevo,
  pedirDni,
  textoConocerSavia,
  textoHablarProfesora,
  textoConsultaRecibida,
  textoOpcionInvalida,
  pedirNombreNuevo,
  pedirApellidoNuevo,
  pedirDniNuevo,
  pedirEmailNuevo,
  conNav,
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
  listaActividadesNuevo,
  listaHorariosNuevo,
  listaActividadesParaElegir,
  listaHorariosParaElegir,
  respuestaRegistroOk,
  renderPaginaOpciones,
  esPedidoMas,
  esPedidoAnterior,
  PAGE_SIZE,
} from './respuestas.js';
import {
  obtenerOCrearSesion,
  actualizarSesion,
  guardarDedup,
  replySiDuplicado,
  reclamarEstado,
} from './sesiones.js';
import { buscarAlumnoPorDni, horariosFijosAlumno, normalizarDni } from '../services/alumnos.js';
import {
  listarClasesParaLiberar,
  liberarClaseFija,
  listarClasesParaRecuperar,
  anotarRecuperacion,
} from '../services/turnos.js';
import {
  listarActividadesChatbot,
  listarHorariosParaNuevo,
  registrarAlumnoNuevo,
} from '../services/registroNuevo.js';
import { avisarProfesorChatbot } from '../services/whatsapp.js';
import { resolverEleccionHorario } from './matchHorario.js';

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
  const m = normalizarMensaje(msg)
    .replace(/[!?¡¿.,…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!m) return true;
  if (
    m === 'hi' ||
    m === 'hello' ||
    m === 'ok' ||
    m === 'oka' ||
    m === 'okey' ||
    m === 'okay' ||
    m === 'dale' ||
    m === 'listo' ||
    m === 'gracias' ||
    m === 'chau' ||
    m === 'bye'
  ) {
    return true;
  }
  // Solo saludos CORTOS. "hola quería anotar..." NO es saludo.
  if (/^hola+[!.]*$/.test(m)) return true;
  if (/^hola+\s+(hola+|que\s+tal|como\s+estas?|buenas?)[!.]*$/.test(m) && m.length <= 24) return true;
  if (/^(buen\s*as?|buenas|buen\s*dias?|buena\s*tardes?|buena\s*noches?)[!.]*$/.test(m)) return true;
  return false;
}

/** 00 / menu → siempre menú principal */
function esIrMenuPrincipal(msg) {
  const raw = String(msg || '').trim();
  if (raw === '00') return true;
  const m = normalizarMensaje(raw);
  return m === '00' || m === 'menu' || m === 'menú' || m === 'inicio';
}

/** 0 → paso/menú anterior */
function esVolverAtras(msg) {
  return String(msg || '').trim() === '0';
}

/** ¿Parece una consulta real (no un chat corto / joda)? */
function pareceConsultaLibre(msg) {
  const m = normalizarMensaje(msg);
  if (!m || esMenuOHola(msg)) return false;
  if (m.length >= 20) return true;
  if (/[?]/.test(String(msg))) return true;
  if (
    /\b(quiero|necesito|consulta|consultar|pregunta|cuando|como|donde|precio|horario|turno|anotar|inscrib|clase|pilates)\b/.test(
      m
    )
  ) {
    return true;
  }
  return false;
}

function identidadGuardada(contexto = {}) {
  const dni = normalizarDni(contexto.dni);
  if (dni && dni.length >= 6) return { dni, alumnoId: contexto.alumnoId || null };
  return null;
}

function contextoAlta(ctx = {}) {
  return {
    altaNombre: ctx.altaNombre || null,
    altaApellido: ctx.altaApellido || null,
    altaDni: ctx.altaDni || null,
    altaEmail: ctx.altaEmail || null,
    altaActividadId: ctx.altaActividadId || null,
    opcionesActividades: Array.isArray(ctx.opcionesActividades) ? ctx.opcionesActividades : [],
    opcionesHorariosNuevo: Array.isArray(ctx.opcionesHorariosNuevo) ? ctx.opcionesHorariosNuevo : [],
  };
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

async function irMenuNuevo(telefono) {
  const sesion = await obtenerOCrearSesion(telefono);
  const identidad = identidadGuardada(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_NUEVO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: identidad ? { dni: identidad.dni, alumnoId: identidad.alumnoId } : {},
    mergeContexto: false,
  });
  return menuNuevo();
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

function mapOpcionesMin(opciones) {
  return opciones.map((o) => ({
    turnoId: o.turnoId,
    semana: o.semana,
    label: o.label,
    dia: o.dia || null,
    hora: o.hora || null,
    etiquetaSemana: o.etiquetaSemana || null,
    tipo: o.tipo || 'fija',
    recuperacionId: o.recuperacionId || null,
  }));
}

async function iniciarLiberarClases(telefono, alumno) {
  const { opciones } = await listarClasesParaLiberar(alumno);
  const { texto, opciones: liberables, page } = listaLiberarClases(alumno, opciones, 0);

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
      paginaLista: page || 0,
      opcionesLiberar: mapOpcionesMin(liberables),
    },
    mergeContexto: false,
  });
  return texto;
}

async function iniciarRecuperarClases(telefono, alumno) {
  const { opciones, creditos } = await listarClasesParaRecuperar(alumno);
  const { texto, opciones: recuperables, page } = listaRecuperarClases(alumno, opciones, creditos, 0);

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
      paginaLista: page || 0,
      opcionesRecuperar: mapOpcionesMin(recuperables),
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

async function mostrarActividadesNuevo(telefono) {
  const actividades = await listarActividadesChatbot();
  const { texto } = listaActividadesNuevo(actividades);
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_NUEVO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
  });
  return texto;
}

async function mostrarHorariosNuevo(telefono) {
  const opciones = await listarHorariosParaNuevo({ limite: 80 });
  const { texto } = listaHorariosNuevo(opciones, 0);
  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_NUEVO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
  });
  return texto;
}

async function iniciarAltaNuevo(telefono) {
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_NOMBRE,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {},
    mergeContexto: false,
  });
  return pedirNombreNuevo();
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
    return irMenuNuevo(telefono);
  }

  if (m === '3') {
    return irMenuAlumno(telefono);
  }

  if (m === '4') {
    await actualizarSesion(telefono, {
      estado: ESTADOS.CON_PROFESORA,
      ultimoMenu: ESTADOS.MENU_PRINCIPAL,
      // confirmoConsultaFwd: ya avisamos al elegir 4 → mensajes siguientes van en silencio
      contexto: { derivarProfesora: true, confirmoConsultaFwd: true },
      mergeContexto: false,
    });
    avisarProfesorChatbot({
      tipo: 'hablar',
      telefonoCliente: telefono,
      consultaTexto: '',
    }).catch((e) => console.error('[whatsapp hablar]', e?.message || e));
    return textoHablarProfesora();
  }

  if (esIrMenuPrincipal(m) || esMenuOHola(m) || esVolverAtras(m)) {
    return irMenuPrincipal(telefono);
  }

  const mNorm = normalizarMensaje(m);

  // Intents cortos de alta (no frases largas tipo "hola quería que mi mamá…")
  if (
    m.length <= 40 &&
    (
      mNorm.includes('anotar') ||
      mNorm.includes('nuevo') ||
      mNorm.includes('prueba') ||
      mNorm.includes('sumarme') ||
      mNorm.includes('inscrib')
    )
  ) {
    return irMenuNuevo(telefono);
  }

  // Solo mensajes que parecen consulta real → profesora (y pausar el bot).
  if (pareceConsultaLibre(m)) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.CON_PROFESORA,
      ultimoMenu: ESTADOS.MENU_PRINCIPAL,
      contexto: {
        ultimaConsulta: m,
        derivarProfesora: true,
        confirmoConsultaFwd: true,
      },
      mergeContexto: false,
    });
    avisarProfesorChatbot({
      tipo: 'consulta',
      telefonoCliente: telefono,
      consultaTexto: m,
    }).catch((e) => console.error('[whatsapp consulta]', e?.message || e));
    return textoConsultaRecibida();
  }

  return textoOpcionInvalida(menuPrincipal);
}

async function manejarMenuNuevo(telefono, mensaje) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esMenuOHola(m) || esVolverAtras(m)) {
    return irMenuPrincipal(telefono);
  }

  if (m === '1') return mostrarActividadesNuevo(telefono);
  if (m === '2') return mostrarHorariosNuevo(telefono);
  if (m === '3') return iniciarAltaNuevo(telefono);

  return textoOpcionInvalida(menuNuevo);
}

async function manejarNuevoNombre(telefono, mensaje) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) return irMenuNuevo(telefono);

  if (m.length < 2) {
    return conNav(`El nombre es muy corto. Escribilo de nuevo.`, { atrasLabel: 'Menú nuevo' });
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_APELLIDO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: { altaNombre: m },
    mergeContexto: false,
  });
  return pedirApellidoNuevo();
}

async function manejarNuevoApellido(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_NOMBRE,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return pedirNombreNuevo();
  }

  if (m.length < 2) {
    return conNav(`El apellido es muy corto. Escribilo de nuevo.`, { atrasLabel: 'Paso anterior (nombre)' });
  }

  const alta = contextoAlta(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_DNI,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: { ...alta, altaApellido: m },
    mergeContexto: false,
  });
  return pedirDniNuevo();
}

async function manejarNuevoDni(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    const alta = contextoAlta(sesion.contexto);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_APELLIDO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: { altaNombre: alta.altaNombre },
      mergeContexto: false,
    });
    return pedirApellidoNuevo();
  }

  const dni = normalizarDni(m);
  if (!dni || dni.length < 6) return respuestaDniInvalido();

  const existente = await buscarAlumnoPorDni(dni);
  if (existente) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: existente.id,
        dni: normalizarDni(existente.dni) || dni,
      },
      mergeContexto: false,
    });
    return `Ya estás cargado/a como *${existente.nombre} ${existente.apellido}* 😊

Te paso al menú de alumno:

${menuAlumno()}`;
  }

  const alta = contextoAlta(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_EMAIL,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: { ...alta, altaDni: dni },
    mergeContexto: false,
  });
  return pedirEmailNuevo();
}

async function manejarNuevoEmail(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    const alta = contextoAlta(sesion.contexto);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_DNI,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {
        altaNombre: alta.altaNombre,
        altaApellido: alta.altaApellido,
        altaDni: alta.altaDni,
      },
      mergeContexto: false,
    });
    return pedirDniNuevo();
  }

  let email = m === '-' || m === '—' || normalizarMensaje(m) === 'no' ? '' : m;
  if (email && !email.includes('@')) {
    return `Ese email no parece válido. Escribilo de nuevo (o *-* para omitir).\n\n0️⃣ Cancelar`;
  }

  const alta = contextoAlta(sesion.contexto);
  const actividades = await listarActividadesChatbot();
  const { texto, opciones } = listaActividadesParaElegir(actividades);

  if (!opciones.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_NUEVO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return texto;
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_ACTIVIDAD,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {
      ...alta,
      altaEmail: email,
      opcionesActividades: opciones.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        labelPrecio: a.labelPrecio,
        clasesPorSemana: a.clasesPorSemana,
      })),
    },
    mergeContexto: false,
  });
  return texto;
}

async function manejarNuevoActividad(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    const alta = contextoAlta(sesion.contexto);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_EMAIL,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {
        altaNombre: alta.altaNombre,
        altaApellido: alta.altaApellido,
        altaDni: alta.altaDni,
        altaEmail: alta.altaEmail,
      },
      mergeContexto: false,
    });
    return pedirEmailNuevo();
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesActividades)
    ? sesion.contexto.opcionesActividades
    : [];
  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    return `Elegí un número de la lista:\n\n${lineasOpciones(opciones, (a) => `*${a.nombre}* — ${a.labelPrecio}`)}\n\n0️⃣ Cancelar`;
  }

  const elegida = opciones[n - 1];
  const horarios = await listarHorariosParaNuevo({ limite: 80 });
  const { texto, opciones: opsH, page } = listaHorariosParaElegir(horarios, 0);

  if (!opsH.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_NUEVO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return texto;
  }

  const alta = contextoAlta(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_HORARIO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {
      ...alta,
      altaActividadId: elegida.id,
      paginaLista: page || 0,
      opcionesHorariosNuevo: mapOpcionesMin(opsH),
    },
    mergeContexto: false,
  });
  return texto;
}

async function manejarNuevoHorario(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    // Volver a elegir actividad
    const alta = contextoAlta(sesion.contexto);
    const actividades = await listarActividadesChatbot();
    const { texto, opciones } = listaActividadesParaElegir(actividades);
    if (!opciones.length) return irMenuNuevo(telefono);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_ACTIVIDAD,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {
        ...alta,
        opcionesActividades: opciones.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          labelPrecio: a.labelPrecio,
          clasesPorSemana: a.clasesPorSemana,
        })),
      },
      mergeContexto: false,
    });
    return texto;
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesHorariosNuevo)
    ? sesion.contexto.opcionesHorariosNuevo
    : [];
  let page = Number(sesion.contexto?.paginaLista) || 0;

  if (esPedidoMas(m) || esPedidoAnterior(m)) {
    const pages = Math.max(1, Math.ceil(opciones.length / PAGE_SIZE) || 1);
    page = esPedidoMas(m) ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0);
    const { texto } = listaHorariosParaElegir(opciones, page);
    await actualizarSesion(telefono, {
      contexto: { paginaLista: page },
      mergeContexto: true,
    });
    return texto;
  }

  const resolved = resolverEleccionHorario(m, opciones);
  if (!resolved.ok) {
    return textoErrorEleccion(resolved, opciones, page);
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.NUEVO_HORARIO, {
    estadoFinal: ESTADOS.MENU_PRINCIPAL,
  });
  if (!ctxClaim) {
    return `Ya procesamos esa anotación ✅\n\n${menuPrincipal()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesHorariosNuevo) ? ctxClaim.opcionesHorariosNuevo : opciones;
  const opcion = ops[resolved.index] || resolved.opcion;
  const alta = contextoAlta(ctxClaim);

  try {
    const result = await registrarAlumnoNuevo({
      nombre: alta.altaNombre,
      apellido: alta.altaApellido,
      dni: alta.altaDni,
      telefono,
      email: alta.altaEmail,
      actividadId: alta.altaActividadId,
      turnoId: opcion.turnoId,
      semana: opcion.semana,
    });

    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_PRINCIPAL,
      ultimoMenu: ESTADOS.MENU_PRINCIPAL,
      contexto: {
        dni: result.alumno.dni,
        alumnoId: result.alumno.id,
      },
      mergeContexto: false,
    });

    return respuestaRegistroOk(result);
  } catch (e) {
    console.error('[chatbot registro nuevo]', e);
    if (e.status === 409 && e.alumno) {
      await actualizarSesion(telefono, {
        estado: ESTADOS.MENU_ALUMNO,
        ultimoMenu: ESTADOS.MENU_ALUMNO,
        contexto: {
          alumnoId: e.alumno.id,
          dni: normalizarDni(e.alumno.dni),
        },
        mergeContexto: false,
      });
      return `${e.message}\n\n${menuAlumno()}`;
    }
    return `${e.message || 'No se pudo completar el alta.'}\n\nProbá de nuevo con *3* en el menú nuevo, o *0* para salir.`;
  }
}

async function manejarMenuAlumno(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esMenuOHola(m) || esVolverAtras(m)) {
    const reset =
      esIrMenuPrincipal(m) &&
      (normalizarMensaje(m) === 'menu' || normalizarMensaje(m) === 'menú' || normalizarMensaje(m) === 'inicio');
    return irMenuPrincipal(telefono, { resetIdentidad: reset });
  }

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

  if (esIrMenuPrincipal(m) || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }
  if (esVolverAtras(m)) {
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

function textoErrorEleccion(resolved, opciones, page = 0) {
  const pag = renderPaginaOpciones(opciones, page);
  const hint = resolved?.hint || 'Escribí *día y hora*, ej: *Martes 18:00*';
  let extra = '';
  if (resolved?.reason === 'ambiguous' && Array.isArray(resolved.matches)) {
    extra =
      '\n' +
      resolved.matches
        .map((o) => `• ${o.etiquetaSemana || ''} ${o.dia} ${String(o.hora || '').slice(0, 5)}${o.tipo === 'recuperacion' ? ' (recup)' : ''}`)
        .join('\n');
  }
  return `${hint}${extra}

${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

0️⃣ Volver atrás
0️⃣0️⃣ Menú principal`;
}

async function manejarEsperandoLiberar(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }
  if (esVolverAtras(m)) {
    return irMenuAlumno(telefono);
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesLiberar) ? sesion.contexto.opcionesLiberar : [];
  let page = Number(sesion.contexto?.paginaLista) || 0;

  if (esPedidoMas(m) || esPedidoAnterior(m)) {
    const dni = sesion.contexto?.dni;
    const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
    if (!alumno) return irMenuAlumno(telefono);
    const pages = Math.max(1, Math.ceil(opciones.length / PAGE_SIZE) || 1);
    page = esPedidoMas(m) ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0);
    const { texto } = listaLiberarClases(alumno, opciones.map((o) => ({ ...o, yaLiberada: false })), page);
    await actualizarSesion(telefono, {
      contexto: { paginaLista: page },
      mergeContexto: true,
    });
    return texto;
  }

  const resolved = resolverEleccionHorario(m, opciones);
  if (!resolved.ok) {
    return textoErrorEleccion(resolved, opciones, page);
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_LIBERAR);
  if (!ctxClaim) {
    return `Ya procesamos esa elección ✅\n\n${menuAlumno()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesLiberar) ? ctxClaim.opcionesLiberar : opciones;
  const opcion = ops[resolved.index] || resolved.opcion;
  if (!opcion) return irMenuAlumno(telefono);

  const dni = ctxClaim.dni || sesion.contexto?.dni;
  const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
  if (!alumno) {
    return irMenuAlumno(telefono);
  }

  try {
    const result = await liberarClaseFija(alumno, opcion.turnoId, opcion.semana, {
      tipo: opcion.tipo,
      recuperacionId: opcion.recuperacionId,
    });
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

    if (result.yaEstaba) return respuestaLiberacionYaHecha(opcion, menuAlumno);
    return respuestaLiberacionOk(alumno, opcion, creditos, menuAlumno, result);
  } catch (e) {
    console.error('[chatbot liberar]', e);
    return `${e.message || 'No se pudo liberar la clase.'}\n\n0️⃣ Volver`;
  }
}

async function manejarEsperandoRecuperar(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }
  if (esVolverAtras(m)) {
    return irMenuAlumno(telefono);
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesRecuperar) ? sesion.contexto.opcionesRecuperar : [];
  let page = Number(sesion.contexto?.paginaLista) || 0;
  const dniSesion = sesion.contexto?.dni;

  if (esPedidoMas(m) || esPedidoAnterior(m)) {
    const alumno = dniSesion ? await buscarAlumnoPorDni(dniSesion) : null;
    if (!alumno) return irMenuAlumno(telefono);
    const creditos = Number(alumno.clases_para_recuperar) || 0;
    const pages = Math.max(1, Math.ceil(opciones.length / PAGE_SIZE) || 1);
    page = esPedidoMas(m) ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0);
    const { texto } = listaRecuperarClases(alumno, opciones, creditos, page);
    await actualizarSesion(telefono, {
      contexto: { paginaLista: page },
      mergeContexto: true,
    });
    return texto;
  }

  const resolved = resolverEleccionHorario(m, opciones);
  if (!resolved.ok) {
    return textoErrorEleccion(resolved, opciones, page);
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_RECUPERAR);
  if (!ctxClaim) {
    return `Ya procesamos esa elección ✅\n\n${menuAlumno()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesRecuperar) ? ctxClaim.opcionesRecuperar : opciones;
  const opcion = ops[resolved.index] || resolved.opcion;
  if (!opcion) return irMenuAlumno(telefono);

  const dni = ctxClaim.dni || dniSesion;
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

    if (result.yaEstaba) return respuestaRecuperacionYaHecha(opcion, menuAlumno);
    return respuestaRecuperacionOk(alumno, opcion, creditos, menuAlumno);
  } catch (e) {
    console.error('[chatbot recuperar]', e);
    return `${e.message || 'No se pudo anotar la recuperación.'}\n\n0️⃣ Volver`;
  }
}

async function manejarEsperandoConsulta(telefono, mensaje) {
  // Compat: estados viejos ESPERANDO_CONSULTA → misma lógica que CON_PROFESORA
  return manejarConProfesora(telefono, mensaje);
}

/**
 * Modo humano: el bot NO contesta (salvo menu/0/00) para no interrumpir a la profesora.
 * Reenvía el texto al celu del profe.
 */
async function manejarConProfesora(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esVolverAtras(m) || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }

  if (!m) return null;

  avisarProfesorChatbot({
    tipo: 'consulta',
    telefonoCliente: telefono,
    consultaTexto: m,
  }).catch((e) => console.error('[whatsapp consulta]', e?.message || e));

  const yaAvisoCliente = !!sesion?.contexto?.confirmoConsultaFwd;
  await actualizarSesion(telefono, {
    estado: ESTADOS.CON_PROFESORA,
    ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    contexto: {
      derivarProfesora: true,
      ultimaConsulta: m,
      confirmoConsultaFwd: true,
    },
    mergeContexto: true,
  });

  // Primera vez: confirma al cliente sin menú. Después: silencio total.
  if (!yaAvisoCliente) return textoConsultaRecibida();
  return null;
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

    // En modo profesora no devolver replies viejos por dedup
    if (sesion.estado !== ESTADOS.CON_PROFESORA && sesion.estado !== ESTADOS.ESPERANDO_CONSULTA) {
      const dup = replySiDuplicado(sesion, mensaje);
      if (dup) {
        console.log('[chatbot] dedup hit', String(telefono).slice(-6));
        return res.json({ ok: true, reply: dup, estado: sesion.estado, dedup: true });
      }
    }

    let reply;

    switch (sesion.estado) {
      case ESTADOS.MENU_ALUMNO:
        reply = await manejarMenuAlumno(telefono, mensaje, sesion);
        break;
      case ESTADOS.MENU_NUEVO:
        reply = await manejarMenuNuevo(telefono, mensaje);
        break;
      case ESTADOS.NUEVO_NOMBRE:
        reply = await manejarNuevoNombre(telefono, mensaje);
        break;
      case ESTADOS.NUEVO_APELLIDO:
        reply = await manejarNuevoApellido(telefono, mensaje, sesion);
        break;
      case ESTADOS.NUEVO_DNI:
        reply = await manejarNuevoDni(telefono, mensaje, sesion);
        break;
      case ESTADOS.NUEVO_EMAIL:
        reply = await manejarNuevoEmail(telefono, mensaje, sesion);
        break;
      case ESTADOS.NUEVO_ACTIVIDAD:
        reply = await manejarNuevoActividad(telefono, mensaje, sesion);
        break;
      case ESTADOS.NUEVO_HORARIO:
        reply = await manejarNuevoHorario(telefono, mensaje, sesion);
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
      case ESTADOS.CON_PROFESORA:
        reply = await manejarConProfesora(telefono, mensaje, sesion);
        break;
      case ESTADOS.MENU_PRINCIPAL:
      default:
        reply = await manejarMenuPrincipal(telefono, mensaje);
        break;
    }

    const silencioso = reply == null;
    const replyOut = silencioso ? '' : String(reply);

    if (!silencioso) {
      try {
        await guardarDedup(telefono, mensaje, sesion.estado, replyOut);
      } catch (err) {
        console.warn('[chatbot dedup]', err?.message || err);
      }
    }

    const actualizada = await obtenerOCrearSesion(telefono);

    return res.json({
      ok: true,
      reply: replyOut,
      silencioso,
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
