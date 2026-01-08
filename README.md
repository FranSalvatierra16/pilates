# 🌿 SAVIA - Sistema de Gestión

Sistema completo de gestión para SAVIA. Incluye gestión de alumnos, actividades, calendario de turnos, control de acceso, pagos y caja.

## ✨ Características

- **Calendario de Turnos**: Sistema completo de calendario semanal con turnos horarios (7:30-12:30 y 16:00-21:00). Asignación de alumnos a turnos específicos
- **Gestión de Alumnos**: Registro completo con nombre, apellido, DNI, teléfono, email, fecha de vencimiento de cuota y actividad
- **Gestión de Actividades**: Administración de actividades con sus precios mensuales
- **Control de Acceso**: Verificación por DNI con alertas visuales (verde/rojo) según el estado de la cuota
- **Sistema de Pagos**: Registro de pagos con actualización automática de fechas de vencimiento
- **Caja**: Visualización de totales en efectivo, transferencia y total general, con estadísticas del día y del mes

## 🚀 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Inicia el servidor de desarrollo:
```bash
npm run dev
```

3. Abre tu navegador en `http://localhost:5173`

## 📦 Construcción

Para crear una versión de producción:

```bash
npm run build
```

Los archivos se generarán en la carpeta `dist`.

## 💾 Almacenamiento

El sistema utiliza `localStorage` del navegador para guardar todos los datos. Esto significa que:
- Los datos se guardan en tu navegador local
- Si limpias el caché del navegador, perderás los datos
- Para respaldo, puedes exportar los datos manualmente desde las herramientas de desarrollador

## 🎨 Diseño

Interfaz moderna con:
- Diseño responsive (se adapta a móviles, tablets y desktop)
- Colores intuitivos (verde = acceso permitido, rojo = cuota vencida)
- Animaciones y transiciones suaves
- Iconos para mejor usabilidad

## 📱 Secciones

### Dashboard
Vista general con estadísticas y accesos rápidos.

### Calendario de Turnos
- Vista semanal con todos los turnos disponibles
- Horarios: 7:30-12:30 (mañana) y 16:00-21:00 (tarde), cada hora
- Asignación de múltiples alumnos a cada turno
- Navegación entre semanas
- Eliminación de alumnos de turnos específicos

### Alumnos
- Agregar, editar y eliminar alumnos
- Visualización del estado de cuotas
- Información completa de contacto

### Actividades
- Crear y editar actividades
- Establecer precios mensuales
- Validación para evitar eliminar actividades en uso

### Control de Acceso
- Búsqueda por DNI
- Alertas visuales (verde/rojo)
- Información completa del alumno

### Pagos
- Registrar pagos (efectivo o transferencia)
- Actualización automática de fecha de vencimiento
- Historial completo de pagos

### Caja
- Totales en efectivo y transferencia
- Estadísticas del día y del mes
- Promedio por pago
- Últimos pagos registrados

## 🔧 Tecnologías

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide React (iconos)
- date-fns (manejo de fechas)

## 📝 Notas

- Todos los campos marcados con * son obligatorios
- Al registrar un pago, la fecha de vencimiento se actualiza automáticamente (1 mes desde la fecha del pago)
- El sistema valida que no se eliminen actividades que estén siendo utilizadas por alumnos

