# 🚂 Desplegar SAVIA Pilates en Railway

Esta guía te ayuda a subir el proyecto a **Railway** y que funcione con la base de datos en **Supabase**.

## 📋 Qué tenés que tener listo

1. **Cuenta en Railway** – [railway.com](https://railway.com) (podés usar GitHub para iniciar sesión).
2. **Cuenta en Supabase** – [supabase.com](https://supabase.com) (para la base de datos).
3. **Proyecto en GitHub** – este repo subido a tu cuenta.

---

## 🗄️ Parte 1: Base de datos (Supabase)

La app usa **Supabase** como base de datos (no una base dentro de Railway). Tenés que tener el proyecto y las tablas ya creados.

### Si todavía no configuraste Supabase

1. Seguí **PASO-A-PASO-SUPABASE.md** para crear el proyecto en Supabase y ejecutar `supabase-setup.sql`.
2. En Supabase: **Settings → API** y anotá:
   - **Project URL** → lo vas a usar como `VITE_SUPABASE_URL`
   - **anon public** → lo vas a usar como `VITE_SUPABASE_ANON_KEY`

### Si ya tenés Supabase

Solo necesitás tener a mano la **Project URL** y la **anon public key** para configurarlas en Railway.

---

## 🚂 Parte 2: Subir el proyecto a Railway

### 2.1 Crear proyecto en Railway

1. Entrá a [railway.com](https://railway.com) e iniciá sesión (por ejemplo con GitHub).
2. Click en **“New Project”**.
3. Elegí **“Deploy from GitHub repo”**.
4. Conectá tu cuenta de GitHub si te lo pide y seleccioná el repositorio **pilates-railway** (o el nombre que tenga este proyecto).
5. Railway va a crear un **servicio** y va a intentar hacer el primer deploy.

### 2.2 Variables de entorno (importante para la base de datos)

Sin estas variables, la app no puede conectarse a Supabase.

1. En Railway, abrí el **servicio** que se creó (click en la tarjeta del repo).
2. Entrá a la pestaña **“Variables”** (o **Variables** en el menú del servicio).
3. Agregá estas dos variables (con **Add Variable** o **New Variable**):

   | Nombre                 | Valor                          |
   |------------------------|--------------------------------|
   | `VITE_SUPABASE_URL`    | La **Project URL** de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | La **anon public** key de Supabase |

4. Guardá los cambios. Railway suele hacer un **redeploy** solo; si no, en **Deployments** podés hacer **Redeploy** del último deploy.

Importante: las variables tienen que llamarse exactamente así (con `VITE_`) para que Vite las incluya en el build.

### 2.3 Dominio público

1. En el mismo servicio, andá a **“Settings”** (o la pestaña de configuración).
2. Buscá la sección **“Networking”** o **“Public Networking”**.
3. Click en **“Generate Domain”** (o **Add domain**).
4. Railway te va a dar una URL tipo:  
   `https://tu-proyecto-production.up.railway.app`

Esa es la URL de tu app en producción.

---

## ✅ Cómo verificar que todo anda

1. **Build**: en Railway, en **Deployments**, el último deploy debería estar en estado **Success** (o similar).
2. **Base de datos**: al abrir la URL generada, la app debería cargar y, si entrás a las pantallas que usan datos (alumnos, actividades, etc.), deberían verse los datos que tengas en Supabase (o vacío si todavía no cargaste nada).
3. Si algo falla, revisá los **logs** del servicio en Railway y que las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estén bien copiadas (sin espacios de más).

---

## 📁 Qué hace este proyecto en Railway

- **Build**: se ejecuta `npm run build` (genera la carpeta `dist`).
- **Arranque**: se ejecuta `npm run start`, que sirve los archivos de `dist` con `serve` (modo SPA, así que las rutas del front funcionan bien).
- La configuración está en **railway.toml** en la raíz del repo.

---

## 🆘 Problemas frecuentes

### La app carga pero no veo datos / “NO CONFIGURADO”

- Revisá que en Railway estén definidas **VITE_SUPABASE_URL** y **VITE_SUPABASE_ANON_KEY**.
- Después de cambiar variables, hacé un **Redeploy** para que el build se vuelva a hacer con las nuevas variables.

### Error de CORS con Supabase

- En Supabase: **Settings → API**.
- En **Allowed origins** (o similar), agregá la URL de Railway, por ejemplo:  
  `https://tu-proyecto-production.up.railway.app`

### El deploy falla en Railway

- Revisá los **logs del build** en la pestaña Deployments.
- Asegurate de que en el repo esté el **package.json** con el script `"start": "serve dist -s -l ${PORT:-3000}"` y la dependencia `"serve"` (ya está en el proyecto).

---

## Resumen rápido

1. Supabase: proyecto creado, tablas con `supabase-setup.sql`, anotar URL y anon key.
2. Railway: New Project → Deploy from GitHub → elegir este repo.
3. Variables en Railway: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Generate Domain en el servicio.
5. Abrir la URL y probar que la app y la base de datos respondan bien.

Cuando tengas la URL de Railway y las variables configuradas, la base de datos (Supabase) y el front (Railway) quedan conectados y andando.
