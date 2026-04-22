# Manual de uso del sistema (estudio / sucursal)

Guía orientada al equipo del estudio: qué hace cada pantalla, los conceptos principales y dónde encontrar cada función. El nombre comercial puede ser **FitGest** u otro según la instalación; las rutas (URLs) son las mismas.

---

## Tabla de contenidos

1. [Cómo entrar al sistema](#1-cómo-entrar-al-sistema)
2. [Barra superior, menú y notificaciones](#2-barra-superior-menú-y-notificaciones)
3. [Dashboard](#3-dashboard)
4. [Calendario de turnos](#4-calendario-de-turnos)
5. [Alumnos](#5-alumnos)
6. [Profesores](#6-profesores)
7. [Actividades](#7-actividades)
8. [Control de acceso](#8-control-de-acceso)
9. [Pagos](#9-pagos)
10. [Caja](#10-caja)
11. [Notificaciones (pantalla completa)](#11-notificaciones-pantalla-completa)
12. [Agenda](#12-agenda)
13. [Registros por link](#13-registros-por-link)
14. [Portal del alumno: “Tu clase”](#14-portal-del-alumno-tu-clase)
15. [Inscripción pública (`/registro`)](#15-inscripción-pública-registro)
16. [Administración (`/admin`)](#16-administración-admin)
17. [Ruta Planificación](#17-ruta-planificación)
18. [Datos, API y modo local](#18-datos-api-y-modo-local)

---

## 1. Cómo entrar al sistema

| Lugar | Ruta | Para qué sirve |
|--------|------|------------------|
| **Landing** | `/` | Página pública de presentación (sin usuario). |
| **Entrada** | `/entrada` | Elegís **Estudio** (va a login) o **Alumno** (va al portal con modo recuperación). |
| **Iniciar sesión** | `/login` | Usuario y contraseña del estudio. Tras validar, entrás al **Dashboard** de tu sucursal. |
| **Cerrar sesión** | Botón **Salir** en la barra superior | Vuelve al login y limpia la sesión en el navegador. |

**Sucursal en la URL:** en producción suele guardarse `?sucursalId=…` para enlaces y PWA; no hace falta tocarlo en el día a día si ya entraste con tu usuario.

---

## 2. Barra superior, menú y notificaciones

- **Logo / nombre del estudio:** clic lleva al **Dashboard**.
- **Enlaces del menú (escritorio):** Dashboard, Calendario, Alumnos, Profesores, Actividades, Acceso, Pagos, Caja, Agenda. **Notif.** puede aparecer acortado; también existe la página **Notificaciones**.
- **Celular:** ícono de menú (**☰**) abre el **panel lateral** con las mismas secciones + **Salir**.
- **Campana de notificaciones:** despliega las últimas novedades (cupos liberados, inscripciones a recuperar, etc.). Podés **marcar todas leídas** o ir a **Ver todas** (página Notificaciones).
- **Salir:** cierra la sesión del estudio.

---

## 3. Dashboard

**Ruta:** `/dashboard`

Resumen rápido con tarjetas clicables:

| Tarjeta | Indica | Al hacer clic |
|---------|--------|----------------|
| **Total alumnos** | Cantidad de alumnos cargados | Va a **Alumnos**. |
| **Actividades** | Planes / modalidades definidas | Va a **Actividades**. |
| **Cuotas vencidas** | Alumnos con cuota vencida | Va a **Alumnos** para gestionarlos. |
| **Saldo en caja** | Neto del período (ingresos − gastos), si no está bloqueado por PIN | Va a **Caja**. Si las finanzas están restringidas, verás montos ocultos hasta desbloquear en Caja o Pagos. |

Debajo suele haber **accesos rápidos** (enlaces a Calendario, Acceso, etc.) y un texto de bienvenida.

---

## 4. Calendario de turnos

**Ruta:** `/calendario`

Es el centro operativo de la semana: turnos fijos, cupos, asistencias, recuperaciones y liberaciones.

### Qué ves en pantalla

- **Semana actual** (navegación con flechas o selector de fecha “Ir a fecha”).
- **Grilla por día y hora:** cada celda es un **turno** con título, cupo máximo e inscriptos.
- **Alumnos en el turno:** podés abrir el detalle del alumno, marcar **asistencia** (✓ verde / ✗ rojo según corresponda), anotar **recuperaciones**, **liberar la clase de la semana** cuando el alumno no va y liberó cupo, etc.
- **Cupo:** cantidad de lugares; el sistema controla que no se supere al anotar o recuperar.

### Botones y acciones frecuentes

- **+ Nuevo turno** (o similar): crea un turno en un día/hora con título, cupo y opciones asociadas.
- **Compartir disponibles:** arma un mensaje (p. ej. WhatsApp) con turnos que tienen lugar libre.
- **Horarios:** configurá franjas de mañana/tarde y horas no disponibles por día (lo que alimenta la grilla).
- **Ayuda (desplegable):** recuerda que los turnos se repiten semanalmente y cómo usar asistencia.
- **Estadísticas / paneles extra:** según configuración, podés ver resúmenes de asistencia u otras vistas.

### Recuperaciones y liberaciones

- **Recuperación:** el alumno usa el portal para tomar cupo en otro horario según las reglas del estudio.
- **Liberación de cupo:** cuando un alumno con clase fija avisa que no asiste y libera, ese cupo puede usarse por otro (recuperación u otro flujo que defina el estudio).

### Planificación (módulo opcional)

Si el **administrador** habilitó planificación para tu sucursal, en el calendario pueden aparecer **notas de planificación por día** u otras herramientas ligadas a esa función. Si no está habilitada, no verás esas secciones.

---

## 5. Alumnos

**Ruta:** `/alumnos`

Listado de personas que entrenan en el estudio.

### Qué podés hacer

- **Nuevo alumno:** alta con datos personales, actividad/plan, teléfono, DNI, vencimiento de cuota, etc.
- **Editar / ver ficha:** datos, actividad asignada, observaciones.
- **Cuota:** fecha de vencimiento, estado (al día, vence hoy, vencida). Colores o etiquetas ayudan a priorizar cobros.
- **Pagar cuota:** registro del pago vinculado al alumno (impacta en Pagos/Caja según cómo cargues el movimiento).
- **WhatsApp:** si el alumno tiene teléfono cargado, podés abrir un mensaje de recordatorio según el estado de la cuota.
- **Filtros / búsqueda:** encontrar por nombre, estado de cuota, etc. (según lo implementado en tu versión).

---

## 6. Profesores

**Ruta:** `/profesores`

ABM de **profesores** del estudio (nombre, datos que uses en tu instalación). Luego los podés asociar a turnos en el **Calendario** para identificar quién dicta cada clase.

---

## 7. Actividades

**Ruta:** `/actividades`

Define **planes o modalidades**: nombre, precio, opcionalmente **clases por semana** (límite o referencia para el alumno), tipo “prueba”, etc.

- **Nueva actividad:** creá el plan y el precio.
- **Editar / eliminar:** mantené actualizada la oferta del estudio.
- Los **alumnos** quedan asociados a una actividad; eso condiciona mensajes y reglas en calendario/portal.

---

## 8. Control de acceso

**Ruta:** `/acceso`

Pensado para **entrada física** o recepción:

1. Ingresás el **DNI** del alumno y buscás.
2. El sistema muestra si está **habilitado** (cuota al día) o con **problemas** (vencida, etc.).
3. Si corresponde, se puede **registrar el ingreso** y, en paralelo, el sistema intenta **marcar asistencia** en los turnos de **hoy** para esa semana, según la lógica configurada.

Sirve para validar rápido sin abrir el calendario completo.

---

## 9. Pagos

**Ruta:** `/pagos`

Registro de **ingresos** (y visualización alineada con caja).

- **Nuevo pago:** monto, método (efectivo / transferencia), alumno u observación.
- **Listado:** historial filtrable por período o criterios de tu versión.
- **PIN de finanzas:** si está activada la restricción, hasta no ingresar el PIN podés ver solo datos limitados (p. ej. pagos del día); con PIN ves **totales del período**, **neto** y podés **eliminar** pagos si la regla lo permite.

Los totales del período están pensados para coincidir con la lógica de **Caja** (misma ventana de “período abierto”).

---

## 10. Caja

**Ruta:** `/caja`

Vista financiera del **período actual** (y cierres guardados, según tu uso).

- **Ingresos / egresos** por método (efectivo, transferencia).
- **Gastos** del período (lo que resta del efectivo o transferencia según cómo los cargues).
- **Saldo / neto** del período.
- **PIN de finanzas:** similar a Pagos; sin desbloquear, montos sensibles pueden ocultarse.
- **Cerrar período / historial:** para dejar un corte y arrancar uno nuevo (detalle exacto depende de los botones de tu pantalla: “Cerrar”, “Retiros”, etc.).

---

## 11. Notificaciones (pantalla completa)

**Ruta:** `/notificaciones`

Lista **todas** las notificaciones (no solo el menú desplegable de la campana). Podés marcarlas leídas y revisar el historial de avisos del estudio (cupos, recuperaciones, etc.).

---

## 12. Agenda

**Ruta:** `/agenda`

**Notas operativas** del estudio:

- Notas **por día** (recordatorios, pendientes).
- Bloque de notas **sin fecha** para tareas generales.

No reemplaza al calendario de turnos; complementa la gestión del día a día.

---

## 13. Registros por link

**Ruta:** `/registros-link`

Cuando publicás un **link de inscripción**, los interesados se anotan solos. En esta pantalla ves **quién se registró** por ese medio para darlos de alta o contactarlos como alumno formal.

---

## 14. Portal del alumno: “Tu clase”

**Ruta:** `/mi-clase` (pública, sin login del estudio)

El alumno entra con su **DNI** (y datos que pida tu versión).

- Ve sus **clases fijas** y la semana.
- Puede **liberar** la clase de la semana si no asiste (según reglas).
- Puede **anotarse a recuperar** en otro horario con cupo disponible.
- Accesos a **historial**, **notificaciones** del portal, etc., según lo que muestre tu instalación.

Desde **Entrada → Alumno** suele abrirse con el modo adecuado para recuperación.

---

## 15. Inscripción pública (`/registro`)

**Ruta:** `/registro` (con parámetros que te dé el sistema en el link)

Pantalla para que una persona **complete la inscripción** desde un enlace compartido por el estudio. Al finalizar, suele mostrarse confirmación; el estudio ve el movimiento en **Registros por link** o recibe el dato según tu flujo.

---

## 16. Administración (`/admin`)

Solo usuarios con rol **administrador** (no usuario de sucursal).

- **Listado de sucursales:** altas, bajas, edición.
- **Editar sucursal:** nombre, logo, flags (por ejemplo **planificación habilitada** para esa sede), datos técnicos que use tu despliegue.
- **Nueva sucursal:** creación de una sede nueva en el sistema.

El usuario común del estudio **no** ve este menú: si entrás con cuenta de sucursal y probás `/admin`, el sistema te redirige al dashboard.

---

## 17. Ruta Planificación

**Ruta:** `/planificacion`

Hoy **redirige automáticamente al Calendario**. La planificación avanzada (notas en calendario, etc.) se integró allí cuando el admin la habilita para la sucursal.

---

## 18. Datos, API y modo local

- **Con API (`VITE_USE_API=true` en producción típica):** los datos viven en el servidor (p. ej. PostgreSQL en Railway). Varios dispositivos ven lo mismo.
- **Sin API (modo local):** los datos se guardan en el **navegador** de esa computadora; no se comparten con otros equipos. En la interficie puede aparecer un aviso inferior.

Si algo “no guarda”, revisá conexión a la base, variables de entorno y los mensajes de error en pantalla.

---

## Resumen de rutas útiles

| Ruta | Quién |
|------|--------|
| `/` | Público |
| `/entrada`, `/login` | Estudio |
| `/dashboard` … `/agenda` | Usuario sucursal logueado |
| `/mi-clase`, `/registro` | Alumno / público |
| `/admin` | Solo admin |

---

*Documento generado para acompañar el código del proyecto. Actualizá esta guía si agregás pantallas nuevas o cambiás nombres de botones.*
