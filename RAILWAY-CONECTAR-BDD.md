# Conectar la base de datos al servicio pilates en Railway

Si te sale **"Base de datos no configurada"** al guardar algo, el servicio **pilates** no está recibiendo la URL de Postgres. Seguí estos pasos:

## 1. Entrar al servicio correcto

- En Railway, abrí tu proyecto.
- Click en el servicio **pilates** (el de la app, no el de Postgres).

## 2. Agregar la variable referenciando Postgres

- Entrá a la pestaña **Variables**.
- Si ya existe una variable que debería ser la URL de la base pero no funciona, podés editarla o borrarla y crear una nueva.
- Click en **"+ New Variable"** (o **Nueva variable**).
- **Nombre (Key):** tiene que ser exactamente: **`DATABASE_URL`** (en mayúsculas, con guión bajo).
- **Valor (Value):** no lo escribas a mano. Tenés que **referenciar** el Postgres:
  - Buscá la opción **"Add Reference"** / **"Referencia"** / **"Variable reference"**.
  - Elegí el servicio **Postgres** (o como se llame tu base de datos en el proyecto).
  - Seleccioná la variable **`DATABASE_URL`** de ese servicio.
  - O escribí a mano la referencia: **`${{Postgres.DATABASE_URL}}`** (si tu servicio de base se llama distinto, cambiá "Postgres" por ese nombre, ej. `${{nombre-de-tu-servicio-postgres.DATABASE_URL}}`).
- Guardá.

## 3. Redeploy

- Andá a **Deployments**.
- En el último deploy, menú (⋮) → **Redeploy**.
- Esperá a que termine. En los **logs** del deploy debería aparecer al arrancar: **"Base de datos: URL definida"**. Si aparece **"NO DEFINIDA"**, la variable no está llegando (revisá el nombre `DATABASE_URL` y que la referencia sea al servicio correcto).

## Resumen

- Variable en el servicio **pilates**: **`DATABASE_URL`**.
- Valor: referencia al Postgres, por ejemplo **`${{Postgres.DATABASE_URL}}`**.
- Después: **Redeploy** y revisar logs.
