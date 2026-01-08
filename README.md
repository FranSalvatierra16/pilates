# 🌿 SAVIA - Sistema de Gestión para Estudios de Pilates, Yoga y Funcional

Sistema completo de gestión diseñado específicamente para estudios de Pilates, Yoga y entrenamiento funcional. Incluye gestión de alumnos, actividades, calendario de turnos, control de acceso, pagos y caja. Todo en un solo lugar, accesible desde cualquier dispositivo.

## ✨ Características

- **Calendario de Turnos**: Sistema completo de calendario semanal con turnos horarios (7:30-12:30 y 16:00-21:00). Asignación de alumnos a turnos específicos
- **Gestión de Alumnos**: Registro completo con nombre, apellido, DNI, teléfono, email, fecha de vencimiento de cuota y actividad
- **Gestión de Actividades**: Administración de actividades con sus precios mensuales
- **Control de Acceso**: Verificación por DNI con alertas visuales (verde/rojo/amarillo) según el estado de la cuota
- **Sistema de Pagos**: Registro de pagos con actualización automática de fechas de vencimiento
- **Caja**: Visualización de totales en efectivo, transferencia y total general, con estadísticas del día y del mes
- **Gastos**: Sistema de registro de gastos que se descuentan automáticamente de la caja

## 🚀 Instalación Local

1. Instala las dependencias:
```bash
npm install
```

2. Inicia el servidor de desarrollo:
```bash
npm run dev
```

3. Abre tu navegador en `http://localhost:5173`

## 🌐 Despliegue en Producción

### Opción 1: Vercel + Supabase (Recomendado - Gratis)

**Ventajas:**
- ✅ Hosting gratuito ilimitado
- ✅ Base de datos PostgreSQL gratuita (500MB)
- ✅ SSL automático
- ✅ Deploy automático desde GitHub
- ✅ Responsive para móviles

**Pasos:**

1. **Configurar Supabase (Base de Datos)**
   - Ve a https://supabase.com y creá una cuenta
   - Creá un nuevo proyecto
   - En SQL Editor, ejecutá el contenido de `supabase-setup.sql`
   - Copiá tu Project URL y anon key desde Settings → API

2. **Configurar Vercel (Hosting)**
   - Ve a https://vercel.com y conectá tu cuenta de GitHub
   - Importá el repositorio `pilates`
   - Agregá estas variables de entorno:
     - `VITE_SUPABASE_URL` = (tu URL de Supabase)
     - `VITE_SUPABASE_ANON_KEY` = (tu anon key de Supabase)
   - Click en "Deploy"

3. **¡Listo!** Tu app estará online en una URL como `https://pilates-xxxxx.vercel.app`

**Ver guía completa en:** `DEPLOY.md`

### Opción 2: Solo Vercel (sin base de datos)

Si querés probar rápido sin configurar base de datos:
- El sistema usará `localStorage` del navegador
- Los datos solo se guardan en el navegador del usuario
- No se sincronizan entre dispositivos

## 📱 Responsive Design

La aplicación está completamente optimizada para móviles:
- ✅ Menú adaptativo (hamburguesa en móvil)
- ✅ Tablas con scroll horizontal en móvil
- ✅ Formularios optimizados para pantallas pequeñas
- ✅ Botones y controles táctiles
- ✅ Calendario responsive

## 💾 Almacenamiento

### Desarrollo Local
- Usa `localStorage` del navegador
- Los datos se guardan localmente

### Producción (con Supabase)
- Los datos se guardan en PostgreSQL
- Se sincronizan automáticamente
- Accesibles desde cualquier dispositivo

## 🎨 Diseño

Interfaz moderna con:
- Diseño responsive (se adapta a móviles, tablets y desktop)
- Colores intuitivos (verde = acceso permitido, rojo = cuota vencida, amarillo = vence hoy)
- Animaciones y transiciones suaves
- Iconos para mejor usabilidad

## 📱 Secciones

### Dashboard
Vista general con estadísticas y accesos rápidos.

### Calendario de Turnos
- Vista semanal con todos los turnos disponibles
- Horarios: 7:30-12:30 (mañana) y 16:00-21:00 (tarde), cada hora
- Asignación de múltiples alumnos a cada turno
- Eliminación de alumnos de turnos específicos

### Alumnos
- Agregar, editar y eliminar alumnos
- Visualización del estado de cuotas (verde/amarillo/rojo)
- Información completa de contacto
- Botón para pagar cuota directamente
- Fecha de registro automática

### Actividades
- Crear y editar actividades
- Establecer precios mensuales
- Validación para evitar eliminar actividades en uso

### Control de Acceso
- Búsqueda por DNI
- Alertas visuales (verde/amarillo/rojo)
- Información completa del alumno

### Pagos
- Registrar pagos (efectivo o transferencia)
- Actualización automática de fecha de vencimiento
- Historial completo de pagos

### Caja
- Saldo de caja destacado (Ingresos - Gastos)
- Totales en efectivo y transferencia (con gastos descontados)
- Registro de gastos
- Estadísticas del día y del mes
- Promedio por pago
- Últimos pagos y gastos registrados

## 🔧 Tecnologías

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide React (iconos)
- date-fns (manejo de fechas)
- Supabase (base de datos - opcional)

## 📝 Notas

- Todos los campos marcados con * son obligatorios
- Al registrar un pago, la fecha de vencimiento se actualiza automáticamente (1 mes desde la fecha del pago)
- El sistema valida que no se eliminen actividades que estén siendo utilizadas por alumnos
- Los gastos se descuentan automáticamente del total de caja
- El saldo de caja muestra: Ingresos - Gastos = Total Neto

## 🆘 Soporte

Para problemas o preguntas, revisá el archivo `DEPLOY.md` para instrucciones detalladas de despliegue.
