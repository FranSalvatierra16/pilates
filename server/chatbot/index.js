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
  pedirDatosNuevo,
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
  listaHorariosActividadPaso,
  respuestaRegistroOk,
  respuestaRegistroActividadOk,
  listaTurnosParaCambiar,
  listaDestinosCambiar,
  textoConfirmarCambio,
  respuestaCambioOk,
  textoPedirMotivoLiberar,
  labelHorarioCorto,
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
import { buscarAlumnoPorDni, buscarAlumnoPorDniGlobal, horariosFijosAlumno, normalizarDni, getSucursalChatbot, cuotaVencidaAlumno, mensajeCuotaVencidaRecuperar } from '../services/alumnos.js';
import {
  listarClasesParaLiberar,
  liberarClaseFija,
  listarClasesParaRecuperar,
  anotarRecuperacion,
  cambiarTurnoFijo,
} from '../services/turnos.js';
import {
  listarActividadesChatbot,
  listarHorariosParaNuevo,
  listarHorariosFijosParaAlta,
  registrarAlumnoNuevo,
  registrarAlumnoActividad,
} from '../services/registroNuevo.js';
import { avisarProfesorChatbot } from '../services/whatsapp.js';
import { resolverEleccionHorario, resolverEleccionHorariosMultiples } from './matchHorario.js';

const router = express.Router();

const LABELS_ACCION = {
  [ACCIONES_DNI.VENCIMIENTO]: 'ver tu vencimiento',
  [ACCIONES_DNI.CANCELAR]: 'cancelar / liberar una clase',
  [ACCIONES_DNI.RECUPERAR]: 'recuperar una clase',
  [ACCIONES_DNI.HORARIOS]: 'ver tus horarios',
  [ACCIONES_DNI.CAMBIAR]: 'cambiar un turno fijo',
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
    modoAlta: ctx.modoAlta === 'actividad' ? 'actividad' : 'prueba',
    altaNombre: ctx.altaNombre || null,
    altaApellido: ctx.altaApellido || null,
    altaDni: ctx.altaDni || null,
    altaEmail: ctx.altaEmail || null,
    altaActividadId: ctx.altaActividadId || null,
    altaActividadNombre: ctx.altaActividadNombre || null,
    clasesNecesarias: Number(ctx.clasesNecesarias) || 1,
    turnosElegidos: Array.isArray(ctx.turnosElegidos) ? ctx.turnosElegidos : [],
    opcionesActividades: Array.isArray(ctx.opcionesActividades) ? ctx.opcionesActividades : [],
    opcionesHorariosNuevo: Array.isArray(ctx.opcionesHorariosNuevo) ? ctx.opcionesHorariosNuevo : [],
  };
}

function inferirClasesNecesarias(actividad) {
  const n = Number(actividad?.clasesPorSemana);
  if (Number.isFinite(n) && n > 0) return Math.max(1, Math.floor(n));
  const nombre = String(actividad?.nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const m = nombre.match(/(\d+)\s*(x|veces|clase)/);
  if (m) return Math.max(1, Number(m[1]) || 1);
  return 1;
}

function mapTurnoElegido(opcion) {
  return {
    turnoId: opcion.turnoId,
    semana: opcion.semana,
    dia: opcion.dia,
    hora: opcion.hora,
    etiquetaSemana: opcion.etiquetaSemana,
    label: labelHorarioCorto(opcion) || opcion.label,
  };
}

async function completarOContinuarAltaActividad(telefono, sesion, alta, elegidosPrev, agregados, total) {
  const usados = new Set(elegidosPrev.map((t) => String(t.turnoId)));
  const nuevosElegidos = [...elegidosPrev];
  for (const op of agregados) {
    if (!op?.turnoId) continue;
    if (usados.has(String(op.turnoId))) continue;
    usados.add(String(op.turnoId));
    nuevosElegidos.push(mapTurnoElegido(op));
    if (nuevosElegidos.length >= total) break;
  }

  if (!nuevosElegidos.length) {
    return `No pude anotar esos horarios. Probá de nuevo con día y hora.\n\n0️⃣ Volver`;
  }

  if (nuevosElegidos.length < total) {
    const restantes = await listarHorariosFijosParaAlta({
      limite: 80,
      excluirTurnoIds: nuevosElegidos.map((t) => t.turnoId),
    });
    const lista = listaHorariosActividadPaso(restantes, 0, {
      paso: nuevosElegidos.length + 1,
      total,
      elegidosLabels: nuevosElegidos.map((t) => t.label),
    });
    if (!lista.opciones.length) {
      return `No hay más horarios con cupo para completar tu plan (${nuevosElegidos.length}/${total}) 😕

Pedí ayuda con la opción 4️⃣, o volvé (0️⃣) para elegir otro plan.`;
    }
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_HORARIO,
      contexto: {
        turnosElegidos: nuevosElegidos,
        paginaLista: 0,
        opcionesHorariosNuevo: mapOpcionesMin(lista.opciones),
      },
      mergeContexto: true,
    });
    return lista.texto;
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.NUEVO_HORARIO, {
    estadoFinal: ESTADOS.MENU_PRINCIPAL,
  });
  if (!ctxClaim) {
    return `Ya procesamos esa anotación ✅\n\n${menuPrincipal()}`;
  }

  const altaClaim = contextoAlta(ctxClaim);
  try {
    const result = await registrarAlumnoActividad({
      nombre: altaClaim.altaNombre,
      apellido: altaClaim.altaApellido,
      dni: altaClaim.altaDni,
      telefono,
      email: altaClaim.altaEmail,
      actividadId: altaClaim.altaActividadId,
      turnos: nuevosElegidos,
      clasesEsperadas: total,
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

    return respuestaRegistroActividadOk(result);
  } catch (e) {
    console.error('[chatbot registro actividad]', e);
    return textoErrorRegistroAlta(telefono, e, '4');
  }
}

function esErrorDniDuplicadoCatch(e) {
  if (e?.status === 409) return true;
  const msg = String(e?.message || e || '');
  return (
    e?.code === '23505' ||
    msg.includes('alumnos_dni_key') ||
    msg.includes('alumnos_sucursal_id_dni_key') ||
    /duplicate key/i.test(msg)
  );
}

async function textoErrorRegistroAlta(telefono, e, opcionMenu) {
  if (esErrorDniDuplicadoCatch(e)) {
    if (e.alumno?.id) {
      await actualizarSesion(telefono, {
        estado: ESTADOS.MENU_ALUMNO,
        ultimoMenu: ESTADOS.MENU_ALUMNO,
        contexto: {
          alumnoId: e.alumno.id,
          dni: normalizarDni(e.alumno.dni),
        },
        mergeContexto: false,
      });
      return `${e.message || 'Ese DNI ya está registrado.'}\n\n${menuAlumno()}`;
    }
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_NUEVO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return conNav(
      `⚠️ Ese DNI ya está registrado. No se puede volver a cargar.

Si sos vos, usá *“Ya soy alumno/a”* en el menú principal.`,
      { atrasLabel: 'Menú nuevo' }
    );
  }
  const msgAmigable =
    e?.status && e.status >= 400 && e.status < 500
      ? e.message
      : 'No se pudo completar el alta.';
  return `${msgAmigable}\n\nProbá de nuevo con *${opcionMenu}* en el menú nuevo, o *0* para salir.`;
}

function esConfirmacionSi(msg) {
  const m = normalizarMensaje(msg);
  return m === '1' || m === 'si' || m === 'sí' || m === 'confirmo' || m === 'cambiar';
}

function esConfirmacionNo(msg) {
  const m = normalizarMensaje(msg);
  return m === '2' || m === 'no' || m === 'cancelar' || m === 'nada';
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
  if (cuotaVencidaAlumno(alumno)) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni),
      },
      mergeContexto: false,
    });
    return conNav(mensajeCuotaVencidaRecuperar());
  }
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

async function iniciarCambiarTurno(telefono, alumno) {
  const turnos = await horariosFijosAlumno(alumno.id);
  const { texto, opciones } = listaTurnosParaCambiar(alumno, turnos);

  if (!opciones.length) {
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
    estado: ESTADOS.ESPERANDO_CAMBIAR_ORIGEN,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: alumno.id,
      dni: normalizarDni(alumno.dni),
      opcionesCambiarOrigen: opciones,
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
    case ACCIONES_DNI.CAMBIAR:
      return iniciarCambiarTurno(telefono, alumno);
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

async function iniciarAltaNuevo(telefono, modoAlta = 'prueba') {
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_DATOS,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: { modoAlta: modoAlta === 'actividad' ? 'actividad' : 'prueba' },
    mergeContexto: false,
  });
  return pedirDatosNuevo();
}

/**
 * Parsea un mensaje con nombre, apellido y DNI juntos.
 * Ej: "Juan Pérez 40123456" → { nombre: 'Juan', apellido: 'Pérez', dni: '40123456' }
 * El DNI es el token con 6+ dígitos (soporta puntos). El primer token de texto
 * es el nombre y el resto (hasta el DNI) es el apellido.
 */
function parseDatosAlta(texto) {
  const raw = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { ok: false };

  const tokens = raw.split(' ');
  let dni = null;
  const palabras = [];
  for (const tk of tokens) {
    const soloNum = tk.replace(/[.\-]/g, '');
    if (!dni && /^\d{6,9}$/.test(soloNum)) {
      dni = normalizarDni(soloNum);
    } else {
      palabras.push(tk);
    }
  }

  if (!dni) return { ok: false, motivo: 'dni' };
  if (palabras.length < 2) return { ok: false, motivo: 'nombre' };

  const nombre = palabras[0];
  const apellido = palabras.slice(1).join(' ');
  return { ok: true, nombre, apellido, dni };
}

async function manejarNuevoDatos(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) return irMenuNuevo(telefono);

  const alta = contextoAlta(sesion?.contexto);
  const datos = parseDatosAlta(m);

  if (!datos.ok) {
    const detalle =
      datos.motivo === 'dni'
        ? 'No encontré el *DNI* (tienen que ser 6 a 9 números).'
        : 'Necesito *nombre y apellido* además del DNI.';
    return conNav(
      `${detalle}

Mandá todo junto en un mensaje, por ejemplo:
*Juan Pérez 40123456*`,
      { atrasLabel: 'Menú nuevo' }
    );
  }

  const avisoDni = await textoSiDniYaExiste(telefono, datos.dni);
  if (avisoDni) return avisoDni;

  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_EMAIL,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {
      modoAlta: alta.modoAlta,
      altaNombre: datos.nombre,
      altaApellido: datos.apellido,
      altaDni: datos.dni,
    },
    mergeContexto: false,
  });
  return pedirEmailNuevo();
}

/**
 * Si el DNI ya existe (en Fgest u otra sucursal), responde aviso y no deja seguir el alta.
 */
async function textoSiDniYaExiste(telefono, dni) {
  const dniNorm = normalizarDni(dni);
  if (!dniNorm) return null;

  const enSucursal = await buscarAlumnoPorDni(dniNorm);
  if (enSucursal) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: enSucursal.id,
        dni: normalizarDni(enSucursal.dni) || dniNorm,
      },
      mergeContexto: false,
    });
    return `Ese DNI ya está cargado como *${enSucursal.nombre} ${enSucursal.apellido}* 😊

Te paso al menú de alumno:

${menuAlumno()}`;
  }

  const global = await buscarAlumnoPorDniGlobal(dniNorm);
  if (global) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_NUEVO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return conNav(
      `⚠️ Ese DNI (*${dniNorm}*) ya está registrado como *${global.nombre} ${global.apellido}*.

No se puede volver a cargar. Si sos vos, usá la opción *“Ya soy alumno/a”* del menú principal.
Si el DNI es de otra persona, pedile a la profesora que lo revise.`,
      { atrasLabel: 'Menú nuevo' }
    );
  }

  return null;
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
  if (m === '3') return iniciarAltaNuevo(telefono, 'prueba');
  if (m === '4') return iniciarAltaNuevo(telefono, 'actividad');

  return textoOpcionInvalida(menuNuevo);
}

async function manejarNuevoNombre(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) return irMenuNuevo(telefono);

  if (m.length < 2) {
    return conNav(`El nombre es muy corto. Escribilo de nuevo.`, { atrasLabel: 'Menú nuevo' });
  }

  const alta = contextoAlta(sesion?.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_APELLIDO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: { modoAlta: alta.modoAlta, altaNombre: m },
    mergeContexto: false,
  });
  return pedirApellidoNuevo();
}

async function manejarNuevoApellido(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    const alta = contextoAlta(sesion.contexto);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_NOMBRE,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: { modoAlta: alta.modoAlta },
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
    contexto: { modoAlta: alta.modoAlta, altaNombre: alta.altaNombre, altaApellido: m },
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
      contexto: { modoAlta: alta.modoAlta, altaNombre: alta.altaNombre },
      mergeContexto: false,
    });
    return pedirApellidoNuevo();
  }

  const dni = normalizarDni(m);
  if (!dni || dni.length < 6) return respuestaDniInvalido();

  const avisoDni = await textoSiDniYaExiste(telefono, dni);
  if (avisoDni) return avisoDni;

  const alta = contextoAlta(sesion.contexto);
  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_EMAIL,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {
      modoAlta: alta.modoAlta,
      altaNombre: alta.altaNombre,
      altaApellido: alta.altaApellido,
      altaDni: dni,
    },
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
      estado: ESTADOS.NUEVO_DATOS,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: { modoAlta: alta.modoAlta },
      mergeContexto: false,
    });
    return pedirDatosNuevo();
  }

  let email = m === '-' || m === '—' || normalizarMensaje(m) === 'no' ? '' : m;
  if (email && !email.includes('@')) {
    return `Ese email no parece válido. Escribilo de nuevo (o *-* para omitir).\n\n0️⃣ Cancelar`;
  }

  const alta = contextoAlta(sesion.contexto);
  const actividades = await listarActividadesChatbot();
  const { texto, opciones } = listaActividadesParaElegir(actividades, { modoAlta: alta.modoAlta });

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
        modoAlta: alta.modoAlta,
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
  const alta = contextoAlta(sesion.contexto);
  const esActividad = alta.modoAlta === 'actividad';
  const clasesNecesarias = esActividad ? inferirClasesNecesarias(elegida) : 1;

  const horarios = esActividad
    ? await listarHorariosFijosParaAlta({ limite: 80 })
    : await listarHorariosParaNuevo({ limite: 80 });

  const listaFn = esActividad
    ? listaHorariosActividadPaso(horarios, 0, { paso: 1, total: clasesNecesarias, elegidosLabels: [] })
    : listaHorariosParaElegir(horarios, 0);

  const { texto, opciones: opsH, page } = listaFn;

  if (!opsH.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_NUEVO,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {},
      mergeContexto: false,
    });
    return texto;
  }

  if (esActividad && opsH.length < clasesNecesarias) {
    return `Este plan pide *${clasesNecesarias}* horarios, pero ahora solo hay *${opsH.length}* con cupo 😕

Pedí ayuda con la opción 4️⃣ del menú principal, o elegí otro plan (0️⃣).`;
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.NUEVO_HORARIO,
    ultimoMenu: ESTADOS.MENU_NUEVO,
    contexto: {
      ...alta,
      altaActividadId: elegida.id,
      altaActividadNombre: elegida.nombre,
      clasesNecesarias,
      turnosElegidos: [],
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
    const alta = contextoAlta(sesion.contexto);
    const actividades = await listarActividadesChatbot();
    const { texto, opciones } = listaActividadesParaElegir(actividades, { modoAlta: alta.modoAlta });
    if (!opciones.length) return irMenuNuevo(telefono);
    await actualizarSesion(telefono, {
      estado: ESTADOS.NUEVO_ACTIVIDAD,
      ultimoMenu: ESTADOS.MENU_NUEVO,
      contexto: {
        ...alta,
        turnosElegidos: [],
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
  const alta = contextoAlta(sesion.contexto);
  const esActividad = alta.modoAlta === 'actividad';
  const total = Math.max(1, Number(alta.clasesNecesarias) || 1);
  const elegidos = Array.isArray(alta.turnosElegidos) ? alta.turnosElegidos : [];

  if (esPedidoMas(m) || esPedidoAnterior(m)) {
    const pages = Math.max(1, Math.ceil(opciones.length / PAGE_SIZE) || 1);
    page = esPedidoMas(m) ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0);
    const lista = esActividad
      ? listaHorariosActividadPaso(opciones, page, {
          paso: elegidos.length + 1,
          total,
          elegidosLabels: elegidos.map((t) => labelHorarioCorto(t) || t.label),
        })
      : listaHorariosParaElegir(opciones, page);
    await actualizarSesion(telefono, {
      contexto: { paginaLista: page },
      mergeContexto: true,
    });
    return lista.texto;
  }

  if (esActividad) {
    const multi = resolverEleccionHorariosMultiples(m, opciones);
    if (!multi.ok) {
      return textoErrorEleccion(multi, opciones, page);
    }
    const avisoFaltantes =
      Array.isArray(multi.faltantes) && multi.faltantes.length
        ? `\n⚠️ No encontré cupo en: ${multi.faltantes.join(', ')}\n`
        : '';
    const cont = await completarOContinuarAltaActividad(
      telefono,
      sesion,
      alta,
      elegidos,
      multi.opciones,
      total
    );
    return avisoFaltantes ? `${avisoFaltantes}\n${cont}` : cont;
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
  const opcionClaim = ops[resolved.index] || resolved.opcion;
  const altaClaim = contextoAlta(ctxClaim);

  try {
    const result = await registrarAlumnoNuevo({
      nombre: altaClaim.altaNombre,
      apellido: altaClaim.altaApellido,
      dni: altaClaim.altaDni,
      telefono,
      email: altaClaim.altaEmail,
      actividadId: altaClaim.altaActividadId,
      turnoId: opcionClaim.turnoId,
      semana: opcionClaim.semana,
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
    return textoErrorRegistroAlta(telefono, e, '3');
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
  if (m === '5') return pedirDniPara(telefono, ACCIONES_DNI.CAMBIAR, sesion);

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

  const opcion = opciones[resolved.index] || resolved.opcion;
  if (!opcion) return irMenuAlumno(telefono);

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_LIBERAR_MOTIVO,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: sesion.contexto?.alumnoId,
      dni: sesion.contexto?.dni,
      liberarPendiente: {
        turnoId: opcion.turnoId,
        semana: opcion.semana,
        tipo: opcion.tipo || 'fija',
        recuperacionId: opcion.recuperacionId || null,
        dia: opcion.dia,
        hora: opcion.hora,
        etiquetaSemana: opcion.etiquetaSemana,
        label: opcion.label,
      },
    },
    mergeContexto: false,
  });

  return textoPedirMotivoLiberar(opcion);
}

function motivoLiberarDesdeMensaje(mensaje) {
  const m = String(mensaje || '').trim();
  if (!m) return '';
  const norm = normalizarMensaje(m);
  if (
    m === '-' ||
    m === '—' ||
    m === '1' ||
    norm === 'no' ||
    norm === 'nada' ||
    norm === 'saltar' ||
    norm === 'omitir' ||
    norm === 'sin motivo' ||
    norm === 'sinmotivo'
  ) {
    return '';
  }
  return m.slice(0, 280);
}

async function manejarEsperandoLiberarMotivo(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();

  if (esIrMenuPrincipal(m) || esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
  }
  if (esVolverAtras(m)) {
    const dni = sesion.contexto?.dni;
    const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
    if (!alumno) return irMenuAlumno(telefono);
    return iniciarLiberarClases(telefono, alumno);
  }

  const pendiente = sesion.contexto?.liberarPendiente;
  if (!pendiente?.turnoId) {
    return irMenuAlumno(telefono);
  }

  const motivo = motivoLiberarDesdeMensaje(m);

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_LIBERAR_MOTIVO);
  if (!ctxClaim) {
    return `Ya procesamos esa liberación ✅\n\n${menuAlumno()}`;
  }

  const pendienteClaim = ctxClaim.liberarPendiente || pendiente;
  const dni = ctxClaim.dni || sesion.contexto?.dni;
  const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
  if (!alumno) {
    return irMenuAlumno(telefono);
  }

  try {
    const result = await liberarClaseFija(alumno, pendienteClaim.turnoId, pendienteClaim.semana, {
      tipo: pendienteClaim.tipo,
      recuperacionId: pendienteClaim.recuperacionId,
      motivo,
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

    if (result.yaEstaba) return respuestaLiberacionYaHecha(pendienteClaim, menuAlumno);
    return respuestaLiberacionOk(alumno, pendienteClaim, creditos, menuAlumno, {
      ...result,
      motivo,
    });
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

async function manejarEsperandoCambiarOrigen(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) return irMenuAlumno(telefono);

  const opciones = Array.isArray(sesion.contexto?.opcionesCambiarOrigen)
    ? sesion.contexto.opcionesCambiarOrigen
    : [];
  const n = Number.parseInt(m, 10);
  let origen = null;
  if (Number.isFinite(n) && n >= 1 && n <= opciones.length) {
    origen = opciones[n - 1];
  } else {
    const resolved = resolverEleccionHorario(m, opciones);
    if (resolved.ok) origen = opciones[resolved.index] || resolved.opcion;
  }

  if (!origen) {
    return `Elegí el número del turno que querés cambiar:\n\n${lineasOpciones(opciones, (o) => `*${o.dia}* ${o.hora}`)}\n\n0️⃣ Volver`;
  }

  const destinos = await listarHorariosFijosParaAlta({
    limite: 80,
    excluirTurnoIds: [origen.turnoId],
  });
  const origenLabel = labelHorarioCorto(origen) || `${origen.dia} ${origen.hora}`;
  const { texto, opciones: opsDest, page } = listaDestinosCambiar(destinos, 0, origenLabel);

  if (!opsDest.length) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: sesion.contexto?.alumnoId,
        dni: sesion.contexto?.dni,
      },
      mergeContexto: false,
    });
    return texto;
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_CAMBIAR_DESTINO,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: sesion.contexto?.alumnoId,
      dni: sesion.contexto?.dni,
      cambiarOrigen: origen,
      origenLabel,
      paginaLista: page || 0,
      opcionesCambiarDestino: mapOpcionesMin(opsDest),
    },
    mergeContexto: false,
  });
  return texto;
}

async function manejarEsperandoCambiarDestino(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m) || esMenuOHola(m)) return irMenuPrincipal(telefono);
  if (esVolverAtras(m)) {
    const dni = sesion.contexto?.dni;
    const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
    if (!alumno) return irMenuAlumno(telefono);
    return iniciarCambiarTurno(telefono, alumno);
  }

  const opciones = Array.isArray(sesion.contexto?.opcionesCambiarDestino)
    ? sesion.contexto.opcionesCambiarDestino
    : [];
  let page = Number(sesion.contexto?.paginaLista) || 0;
  const origenLabel = sesion.contexto?.origenLabel || 'turno actual';

  if (esPedidoMas(m) || esPedidoAnterior(m)) {
    const pages = Math.max(1, Math.ceil(opciones.length / PAGE_SIZE) || 1);
    page = esPedidoMas(m) ? Math.min(page + 1, pages - 1) : Math.max(page - 1, 0);
    const { texto } = listaDestinosCambiar(opciones, page, origenLabel);
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

  const destino = opciones[resolved.index] || resolved.opcion;
  if (!destino) return irMenuAlumno(telefono);

  const destinoLabel = labelHorarioCorto(destino) || destino.label || `${destino.dia} ${destino.hora}`;

  await actualizarSesion(telefono, {
    estado: ESTADOS.ESPERANDO_CAMBIAR_CONFIRM,
    ultimoMenu: ESTADOS.MENU_ALUMNO,
    contexto: {
      alumnoId: sesion.contexto?.alumnoId,
      dni: sesion.contexto?.dni,
      cambiarOrigen: sesion.contexto?.cambiarOrigen,
      origenLabel,
      cambiarDestino: destino,
      destinoLabel,
    },
    mergeContexto: false,
  });

  return textoConfirmarCambio(origenLabel, destinoLabel);
}

async function manejarEsperandoCambiarConfirm(telefono, mensaje, sesion) {
  const m = String(mensaje || '').trim();
  if (esIrMenuPrincipal(m)) return irMenuPrincipal(telefono);

  if (esConfirmacionNo(m) || esVolverAtras(m)) {
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: sesion.contexto?.alumnoId,
        dni: sesion.contexto?.dni,
      },
      mergeContexto: false,
    });
    return `Cancelado. No cambiaste el turno.\n\n${menuAlumno()}`;
  }

  if (!esConfirmacionSi(m)) {
    return textoConfirmarCambio(
      sesion.contexto?.origenLabel || 'turno actual',
      sesion.contexto?.destinoLabel || 'nuevo horario'
    );
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_CAMBIAR_CONFIRM);
  if (!ctxClaim) {
    return `Ya procesamos ese cambio ✅\n\n${menuAlumno()}`;
  }

  const dni = ctxClaim.dni || sesion.contexto?.dni;
  const alumno = dni ? await buscarAlumnoPorDni(dni) : null;
  if (!alumno) return irMenuAlumno(telefono);

  const origen = ctxClaim.cambiarOrigen;
  const destino = ctxClaim.cambiarDestino;
  if (!origen?.turnoId || !destino?.turnoId) {
    return `Faltó algún dato del cambio. Probá de nuevo.\n\n${menuAlumno()}`;
  }

  try {
    const result = await cambiarTurnoFijo(alumno, origen.turnoId, destino.turnoId);
    await actualizarSesion(telefono, {
      estado: ESTADOS.MENU_ALUMNO,
      ultimoMenu: ESTADOS.MENU_ALUMNO,
      contexto: {
        alumnoId: alumno.id,
        dni: normalizarDni(alumno.dni) || dni,
      },
      mergeContexto: false,
    });
    return respuestaCambioOk(
      alumno,
      result.origenLabel || ctxClaim.origenLabel,
      result.destinoLabel || ctxClaim.destinoLabel,
      menuAlumno
    );
  } catch (e) {
    console.error('[chatbot cambiar]', e);
    return `${e.message || 'No se pudo cambiar el turno.'}\n\n0️⃣ Volver`;
  }
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
        const suc = await getSucursalChatbot();
        return res.json({
          ok: true,
          reply: dup,
          estado: sesion.estado,
          dedup: true,
          sucursal: suc?.usuario || null,
          sucursalId: suc?.id || null,
        });
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
      case ESTADOS.NUEVO_DATOS:
        reply = await manejarNuevoDatos(telefono, mensaje, sesion);
        break;
      case ESTADOS.NUEVO_NOMBRE:
        reply = await manejarNuevoNombre(telefono, mensaje, sesion);
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
      case ESTADOS.ESPERANDO_LIBERAR_MOTIVO:
        reply = await manejarEsperandoLiberarMotivo(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_RECUPERAR:
        reply = await manejarEsperandoRecuperar(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_CAMBIAR_ORIGEN:
        reply = await manejarEsperandoCambiarOrigen(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_CAMBIAR_DESTINO:
        reply = await manejarEsperandoCambiarDestino(telefono, mensaje, sesion);
        break;
      case ESTADOS.ESPERANDO_CAMBIAR_CONFIRM:
        reply = await manejarEsperandoCambiarConfirm(telefono, mensaje, sesion);
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
    const suc = await getSucursalChatbot();

    return res.json({
      ok: true,
      reply: replyOut,
      silencioso,
      estado: actualizada.estado,
      sucursal: suc?.usuario || null,
      sucursalNombre: suc?.nombre_lugar || null,
      sucursalId: suc?.id || null,
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
