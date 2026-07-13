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

  const mNorm = normalizarMensaje(m);
  if (
    mNorm.includes('anotar') ||
    mNorm.includes('nuevo') ||
    mNorm.includes('prueba') ||
    mNorm.includes('sumarme') ||
    mNorm.includes('inscrib')
  ) {
    return irMenuNuevo(telefono);
  }

  await actualizarSesion(telefono, {
    estado: ESTADOS.MENU_PRINCIPAL,
    ultimoMenu: ESTADOS.MENU_PRINCIPAL,
    contexto: { ultimaConsulta: m },
  });
  return textoConsultaRecibida();
}

async function manejarMenuNuevo(telefono, mensaje) {
  const m = String(mensaje || '').trim();
  const mNorm = normalizarMensaje(m);

  if (m === '0' || esMenuOHola(m) || mNorm === 'menu' || mNorm === 'inicio') {
    return irMenuPrincipal(telefono);
  }

  if (m === '1') return mostrarActividadesNuevo(telefono);
  if (m === '2') return mostrarHorariosNuevo(telefono);
  if (m === '3') return iniciarAltaNuevo(telefono);

  return textoOpcionInvalida(menuNuevo);
}

async function manejarNuevoNombre(telefono, mensaje) {
  const m = String(mensaje || '').trim();
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

  if (m.length < 2) {
    return `El nombre es muy corto. Escribilo de nuevo.\n\n0️⃣ Cancelar`;
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
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

  if (m.length < 2) {
    return `El apellido es muy corto. Escribilo de nuevo.\n\n0️⃣ Cancelar`;
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
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

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
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

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
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

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
  if (m === '0' || esMenuOHola(m)) return irMenuNuevo(telefono);

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

  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    const pag = renderPaginaOpciones(opciones, page);
    return `Elegí un número de la lista:\n${pag.header}${pag.lineas}\n${pag.pie ? `${pag.pie}\n` : ''}\n0️⃣ Cancelar`;
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.NUEVO_HORARIO, {
    estadoFinal: ESTADOS.MENU_PRINCIPAL,
  });
  if (!ctxClaim) {
    return `Ya procesamos esa anotación ✅\n\n${menuPrincipal()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesHorariosNuevo) ? ctxClaim.opcionesHorariosNuevo : opciones;
  const opcion = ops[n - 1];
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
  const mNorm = normalizarMensaje(m);

  if (m === '0') {
    return irMenuPrincipal(telefono);
  }

  if (mNorm === 'menu' || mNorm === 'menú' || mNorm === 'inicio') {
    return irMenuPrincipal(telefono, { resetIdentidad: true });
  }
  if (esMenuOHola(m)) {
    return irMenuPrincipal(telefono);
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

  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    const pag = renderPaginaOpciones(opciones, page);
    return `Elegí un número de la lista:\n${pag.header}${pag.lineas}\n${pag.pie ? `${pag.pie}\n` : ''}\n0️⃣ Cancelar`;
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_LIBERAR);
  if (!ctxClaim) {
    return `Ya procesamos esa elección ✅\n\n${menuAlumno()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesLiberar) ? ctxClaim.opcionesLiberar : opciones;
  const opcion = ops[n - 1];
  if (!opcion) return irMenuAlumno(telefono);

  const dni = ctxClaim.dni || sesion.contexto?.dni;
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

    if (result.yaEstaba) return respuestaLiberacionYaHecha(opcion, menuAlumno);
    return respuestaLiberacionOk(alumno, opcion, creditos, menuAlumno);
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

  const n = Number.parseInt(m, 10);
  if (!Number.isFinite(n) || n < 1 || n > opciones.length) {
    const pag = renderPaginaOpciones(opciones, page);
    return `Elegí un número de la lista:\n${pag.header}${pag.lineas}\n${pag.pie ? `${pag.pie}\n` : ''}\n0️⃣ Cancelar`;
  }

  const ctxClaim = await reclamarEstado(telefono, ESTADOS.ESPERANDO_RECUPERAR);
  if (!ctxClaim) {
    return `Ya procesamos esa elección ✅\n\n${menuAlumno()}`;
  }

  const ops = Array.isArray(ctxClaim.opcionesRecuperar) ? ctxClaim.opcionesRecuperar : opciones;
  const opcion = ops[n - 1];
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

    const dup = replySiDuplicado(sesion, mensaje);
    if (dup) {
      console.log('[chatbot] dedup hit', String(telefono).slice(-6));
      return res.json({ ok: true, reply: dup, estado: sesion.estado, dedup: true });
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
        reply = await manejarEsperandoConsulta(telefono, mensaje);
        break;
      case ESTADOS.MENU_PRINCIPAL:
      default:
        reply = await manejarMenuPrincipal(telefono, mensaje);
        break;
    }

    try {
      await guardarDedup(telefono, mensaje, sesion.estado, reply);
    } catch (err) {
      console.warn('[chatbot dedup]', err?.message || err);
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
