# 🚀 Guía de Despliegue - SAVIA Pilates

Esta guía te ayudará a subir tu aplicación a Vercel (hosting gratuito) y configurar Supabase (base de datos gratuita).

## 📋 Requisitos Previos

1. Cuenta en GitHub (ya la tenés)
2. Cuenta en Vercel (gratis) - https://vercel.com
3. Cuenta en Supabase (gratis) - https://supabase.com

## 🗄️ Paso 1: Configurar Supabase (Base de Datos)

### 1.1 Crear proyecto en Supabase

1. Ve a https://supabase.com y creá una cuenta (o iniciá sesión)
2. Click en "New Project"
3. Elegí una organización o creá una nueva
4. Configurá:
   - **Name**: `savia-pilates` (o el nombre que prefieras)
   - **Database Password**: Guardá esta contraseña en un lugar seguro
   - **Region**: Elegí la más cercana (ej: South America)
5. Click en "Create new project"
6. Esperá 2-3 minutos mientras se crea el proyecto

### 1.2 Crear las tablas

1. En el panel de Supabase, ve a **SQL Editor** (ícono de base de datos en el menú lateral)
2. Click en "New query"
3. Copiá y pegá todo el contenido del archivo `supabase-setup.sql`
4. Click en "Run" (o presioná Cmd/Ctrl + Enter)
5. Deberías ver "Success. No rows returned"

### 1.3 Obtener las credenciales

1. En el panel de Supabase, ve a **Settings** (ícono de engranaje) → **API**
2. Copiá estos valores:
   - **Project URL** (será tu `VITE_SUPABASE_URL`)
   - **anon public** key (será tu `VITE_SUPABASE_ANON_KEY`)

## 🌐 Paso 2: Configurar Vercel (Hosting)

### 2.1 Conectar con GitHub

1. Ve a https://vercel.com y creá una cuenta (o iniciá sesión con GitHub)
2. Click en "Add New..." → "Project"
3. Conectá tu repositorio de GitHub si no lo hiciste
4. Seleccioná el repositorio `pilates`
5. Vercel detectará automáticamente que es un proyecto Vite

### 2.2 Configurar Variables de Entorno

Antes de hacer deploy, configurá las variables de entorno:

1. En la página de configuración del proyecto, ve a **Environment Variables**
2. Agregá estas variables:
   - **Name**: `VITE_SUPABASE_URL`
     **Value**: (la URL que copiaste de Supabase)
   - **Name**: `VITE_SUPABASE_ANON_KEY`
     **Value**: (la clave anon que copiaste de Supabase)
3. Click en "Save"

### 2.3 Hacer Deploy

1. Click en "Deploy"
2. Esperá 2-3 minutos mientras se construye y despliega
3. ¡Listo! Tu app estará disponible en una URL como: `https://pilates-xxxxx.vercel.app`

## 📱 Verificar Responsive

La aplicación ya está diseñada para ser responsive. Podés probarla:
- En el navegador: presioná F12 y activá el modo dispositivo móvil
- En tu celular: abrí la URL de Vercel

## 🔄 Actualizar el Código para Usar Supabase

**IMPORTANTE**: Actualmente el código usa `localStorage`. Para usar Supabase, necesitás actualizar el archivo `src/utils/storage.ts` para que use Supabase en lugar de localStorage.

¿Querés que actualice el código ahora para usar Supabase?

## 📝 Notas

- **Gratis**: Tanto Vercel como Supabase tienen planes gratuitos generosos
- **Base de datos**: Supabase te da 500MB gratis (más que suficiente para empezar)
- **Hosting**: Vercel te da hosting ilimitado en el plan gratuito
- **Dominio personalizado**: Podés agregar tu propio dominio después si querés

## 🆘 Problemas Comunes

### Error de CORS
Si tenés problemas de CORS, en Supabase ve a Settings → API → y agregá tu dominio de Vercel a "Allowed Origins"

### Variables de entorno no funcionan
Asegurate de que las variables empiecen con `VITE_` para que Vite las reconozca

### La base de datos está vacía
Recordá ejecutar el script SQL en Supabase antes de usar la app

