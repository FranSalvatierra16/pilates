# 🚂 Desplegar SAVIA con PostgreSQL en Railway

Esta guía es para usar **PostgreSQL de Railway** como base de datos (sin Supabase).

## 📋 Resumen

- **Un solo servicio** en Railway: el mismo servidor sirve la API (Node/Express) y el frontend (React).
- **Base de datos**: PostgreSQL que agregás como plugin en el mismo proyecto de Railway.
- **Variables**: `VITE_USE_API=true` para que el front use la API, y `DATABASE_URL` (la agrega Railway al conectar Postgres).

---

## 1. Crear proyecto y conectar GitHub

1. Entrá a [railway.com](https://railway.com) e iniciá sesión.
2. **New Project** → **Deploy from GitHub repo**.
3. Elegí el repositorio de este proyecto.

---

## 2. Agregar PostgreSQL

1. En el mismo proyecto de Railway, click en **"+ New"** (o **Add Service**).
2. Elegí **"Database"** → **"PostgreSQL"**.
3. Railway crea un servicio de base de datos y te asigna automáticamente la variable **`DATABASE_URL`** en el servicio de la app (o podés referenciarla desde el servicio de la app).

Si la variable no aparece en tu servicio de la app:

- Entrá al servicio **PostgreSQL** que creaste.
- En **Variables** o **Connect**, copiá la **Connection URL** (o `DATABASE_URL`).
- En el servicio de tu **app (pilates)**, en **Variables**, agregá:
  - **Nombre:** `DATABASE_URL`
  - **Valor:** la URL que copiaste (ej. `postgresql://postgres:xxx@xxx.railway.app:5432/railway`).

---

## 3. Variables del servicio de la app

En el servicio **pilates** (el que hace deploy del repo), en **Variables**, asegurate de tener:

| Variable        | Valor              | Dónde se usa      |
|-----------------|--------------------|--------------------|
| `VITE_USE_API`  | `true`             | Frontend (build)   |
| `DATABASE_URL`  | (lo agrega Railway al conectar Postgres, o lo copiás del servicio Postgres) | Backend (Node)     |

- **`VITE_USE_API=true`**: hace que el frontend use la API de este mismo servidor (y por tanto la base PostgreSQL).
- **`DATABASE_URL`**: la usa el servidor Node para conectarse a PostgreSQL. Si agregaste Postgres desde el mismo proyecto, Railway suele inyectarla en el servicio de la app; si no, agregala a mano como arriba.

---

## 4. Build y dominio

- **Build**: Railway usa `npm run build` (genera la carpeta `dist` del frontend).
- **Start**: `npm run start` ejecuta el servidor Node (`server/index.js`), que:
  - Crea las tablas en PostgreSQL al arrancar (si no existen).
  - Sirve la API en `/api/...`.
  - Sirve los archivos estáticos del front desde `dist`.

Generá un dominio público para el servicio **pilates** (Settings → Networking → **Generate Domain**). El puerto lo asigna Railway; el servidor usa `process.env.PORT`.

---

## 5. Probar

1. Abrí la URL que te dio Railway.
2. Deberías ver el login/dashboard y poder usar alumnos, actividades, pagos, profesores, turnos y asistencias.
3. Los datos se guardan en PostgreSQL.

---

## Desarrollo local con PostgreSQL

Si querés usar la API (y por tanto la base) en local:

1. Creá un archivo **`.env`** en la raíz del proyecto (no lo subas a Git):

   ```env
   VITE_USE_API=true
   VITE_API_URL=http://localhost:3000
   DATABASE_URL=postgresql://usuario:password@localhost:5432/nombre_db
   ```

2. Iniciá PostgreSQL en tu máquina (o usá un contenedor) y creá la base.
3. En una terminal: `npm run build` y luego `npm run start` (servidor en el puerto 3000).
4. En otra terminal: `npm run dev` (Vite en el puerto 5173). El front en dev usará `VITE_API_URL` para hablar con la API en el 3000.

---

## Resumen rápido

1. Proyecto en Railway desde GitHub.
2. Agregar servicio **PostgreSQL** en el mismo proyecto.
3. En el servicio de la app: `VITE_USE_API=true` y `DATABASE_URL` (si no la inyecta Railway).
4. Generate Domain para el servicio de la app.
5. Deploy: la app y la base quedan en Railway, sin Supabase.
